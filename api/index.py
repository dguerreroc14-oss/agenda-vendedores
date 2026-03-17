from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Dict
import sqlite3
import os
import hashlib
import secrets
import traceback

app = FastAPI()

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# On Vercel, /tmp is the only writable directory
DB_PATH = os.environ.get("DB_PATH", "/tmp/app.db")

# Default admin credentials
ADMIN_USER = os.environ.get("ADMIN_USER", "DAVID")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "david1402@")

# In-memory session store: token -> {username, role}
active_sessions: Dict[str, Dict[str, str]] = {}


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str


class VisitCreate(BaseModel):
    vendedor: str
    cliente: str
    telefono: str
    fecha: str
    hora: str
    direccion: Optional[str] = ""
    notas: Optional[str] = ""


class VisitUpdate(BaseModel):
    vendedor: Optional[str] = None
    cliente: Optional[str] = None
    telefono: Optional[str] = None
    fecha: Optional[str] = None
    hora: Optional[str] = None
    direccion: Optional[str] = None
    notas: Optional[str] = None
    vendida: Optional[bool] = None


def get_db() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def init_db():
    db = get_db()
    db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'vendedor',
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS visitas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vendedor TEXT NOT NULL,
            cliente TEXT NOT NULL,
            telefono TEXT NOT NULL,
            fecha TEXT NOT NULL,
            hora TEXT NOT NULL,
            direccion TEXT DEFAULT '',
            notas TEXT DEFAULT '',
            vendida BOOLEAN DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    cursor = db.execute("SELECT id FROM users WHERE username = ?", (ADMIN_USER,))
    existing = cursor.fetchone()
    if not existing:
        db.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            (ADMIN_USER, hash_password(ADMIN_PASS), "admin")
        )
    db.commit()
    db.close()


_db_initialized = False


def ensure_db():
    global _db_initialized
    if not _db_initialized:
        init_db()
        _db_initialized = True


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "traceback": traceback.format_exc()},
    )


@app.get("/api/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/api/healthz/db")
def healthz_db():
    ensure_db()
    return {"status": "ok", "db_path": DB_PATH}


def verify_token(request: Request) -> Dict[str, str]:
    token = request.headers.get("X-Auth-Token", "")
    if not token:
        raise HTTPException(status_code=401, detail="No autorizado")
    session = active_sessions.get(token)
    if not session:
        raise HTTPException(status_code=401, detail="Sesion invalida")
    return session


def verify_admin(request: Request) -> Dict[str, str]:
    session = verify_token(request)
    if session["role"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores pueden realizar esta accion")
    return session


@app.post("/api/login")
def login(data: LoginRequest):
    ensure_db()
    db = get_db()
    cursor = db.execute(
        "SELECT username, password_hash, role FROM users WHERE username = ?",
        (data.username,)
    )
    user = cursor.fetchone()
    db.close()
    if not user or user["password_hash"] != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Usuario o contrasena incorrectos")
    token = secrets.token_hex(32)
    active_sessions[token] = {"username": user["username"], "role": user["role"]}
    return {"token": token, "username": user["username"], "role": user["role"]}


@app.get("/api/users")
def listar_usuarios(session: dict = Depends(verify_admin)):
    ensure_db()
    db = get_db()
    cursor = db.execute("SELECT id, username, role, created_at FROM users ORDER BY id")
    rows = cursor.fetchall()
    users = [
        {"id": row["id"], "username": row["username"], "role": row["role"], "created_at": row["created_at"]}
        for row in rows
    ]
    db.close()
    return users


@app.post("/api/users")
def crear_usuario(user_data: UserCreate, session: dict = Depends(verify_admin)):
    ensure_db()
    db = get_db()
    cursor = db.execute("SELECT id FROM users WHERE username = ?", (user_data.username,))
    existing = cursor.fetchone()
    if existing:
        db.close()
        raise HTTPException(status_code=400, detail="El usuario ya existe")
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        (user_data.username, hash_password(user_data.password), "vendedor")
    )
    db.commit()
    db.close()
    return {"message": "Usuario vendedor creado exitosamente"}


@app.delete("/api/users/{user_id}")
def eliminar_usuario(user_id: int, session: dict = Depends(verify_admin)):
    ensure_db()
    db = get_db()
    cursor = db.execute("SELECT id, role FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user["role"] == "admin":
        db.close()
        raise HTTPException(status_code=400, detail="No se puede eliminar un administrador")
    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    db.commit()
    db.close()
    return {"message": "Usuario eliminado exitosamente"}


@app.post("/api/visitas")
def crear_visita(visita: VisitCreate, session: dict = Depends(verify_token)):
    ensure_db()
    db = get_db()
    cursor = db.execute(
        """INSERT INTO visitas (vendedor, cliente, telefono, fecha, hora, direccion, notas)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (visita.vendedor, visita.cliente, visita.telefono, visita.fecha, visita.hora, visita.direccion, visita.notas)
    )
    visita_id = cursor.lastrowid
    db.commit()
    db.close()
    return {"id": visita_id, "message": "Visita creada exitosamente"}


@app.get("/api/visitas")
def listar_visitas(session: dict = Depends(verify_token)):
    ensure_db()
    db = get_db()
    cursor = db.execute("SELECT * FROM visitas ORDER BY fecha DESC, hora DESC")
    rows = cursor.fetchall()
    visitas = []
    for row in rows:
        visitas.append({
            "id": row["id"],
            "vendedor": row["vendedor"],
            "cliente": row["cliente"],
            "telefono": row["telefono"],
            "fecha": row["fecha"],
            "hora": row["hora"],
            "direccion": row["direccion"],
            "notas": row["notas"],
            "vendida": bool(row["vendida"]),
            "created_at": row["created_at"],
        })
    db.close()
    return visitas


@app.get("/api/visitas/{visita_id}")
def obtener_visita(visita_id: int, session: dict = Depends(verify_token)):
    ensure_db()
    db = get_db()
    cursor = db.execute("SELECT * FROM visitas WHERE id = ?", (visita_id,))
    row = cursor.fetchone()
    db.close()
    if not row:
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    return {
        "id": row["id"],
        "vendedor": row["vendedor"],
        "cliente": row["cliente"],
        "telefono": row["telefono"],
        "fecha": row["fecha"],
        "hora": row["hora"],
        "direccion": row["direccion"],
        "notas": row["notas"],
        "vendida": bool(row["vendida"]),
        "created_at": row["created_at"],
    }


@app.patch("/api/visitas/{visita_id}")
def actualizar_visita(visita_id: int, visita: VisitUpdate, session: dict = Depends(verify_admin)):
    ensure_db()
    db = get_db()
    cursor = db.execute("SELECT * FROM visitas WHERE id = ?", (visita_id,))
    existing = cursor.fetchone()
    if not existing:
        db.close()
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    updates = {}
    for field, value in visita.model_dump(exclude_unset=True).items():
        updates[field] = value
    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
        values = list(updates.values())
        values.append(visita_id)
        db.execute(f"UPDATE visitas SET {set_clause} WHERE id = ?", values)
        db.commit()
    db.close()
    return {"message": "Visita actualizada exitosamente"}


@app.delete("/api/visitas/{visita_id}")
def eliminar_visita(visita_id: int, session: dict = Depends(verify_admin)):
    ensure_db()
    db = get_db()
    cursor = db.execute("SELECT * FROM visitas WHERE id = ?", (visita_id,))
    existing = cursor.fetchone()
    if not existing:
        db.close()
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    db.execute("DELETE FROM visitas WHERE id = ?", (visita_id,))
    db.commit()
    db.close()
    return {"message": "Visita eliminada exitosamente"}


@app.patch("/api/visitas/{visita_id}/vendida")
def marcar_vendida(visita_id: int, session: dict = Depends(verify_admin)):
    ensure_db()
    db = get_db()
    cursor = db.execute("SELECT * FROM visitas WHERE id = ?", (visita_id,))
    existing = cursor.fetchone()
    if not existing:
        db.close()
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    new_value = not bool(existing["vendida"])
    db.execute("UPDATE visitas SET vendida = ? WHERE id = ?", (new_value, visita_id))
    db.commit()
    db.close()
    return {"vendida": new_value, "message": "Estado de venta actualizado"}
