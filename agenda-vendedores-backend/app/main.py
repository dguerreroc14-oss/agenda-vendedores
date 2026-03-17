from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import aiosqlite
import os
import hashlib
import secrets
from pathlib import Path

app = FastAPI()

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

DB_PATH = os.environ.get("DB_PATH", "/data/app.db")

# Default admin credentials
ADMIN_USER = os.environ.get("ADMIN_USER", "DAVID")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "david1402@")

# In-memory session store: token -> {username, role}
active_sessions: dict[str, dict[str, str]] = {}


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


async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    return db


async def init_db():
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    db = await get_db()
    await db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'vendedor',
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    await db.execute("""
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
    cursor = await db.execute("SELECT id FROM users WHERE username = ?", (ADMIN_USER,))
    existing = await cursor.fetchone()
    if not existing:
        await db.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            (ADMIN_USER, hash_password(ADMIN_PASS), "admin")
        )
    await db.commit()
    await db.close()


@app.on_event("startup")
async def startup():
    await init_db()


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


async def verify_token(request: Request) -> dict[str, str]:
    token = request.headers.get("X-Auth-Token", "")
    if not token:
        raise HTTPException(status_code=401, detail="No autorizado")
    session = active_sessions.get(token)
    if not session:
        raise HTTPException(status_code=401, detail="Sesion invalida")
    return session


async def verify_admin(request: Request) -> dict[str, str]:
    session = await verify_token(request)
    if session["role"] != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores pueden realizar esta accion")
    return session


@app.post("/api/login")
async def login(data: LoginRequest):
    db = await get_db()
    cursor = await db.execute(
        "SELECT username, password_hash, role FROM users WHERE username = ?",
        (data.username,)
    )
    user = await cursor.fetchone()
    await db.close()
    if not user or user["password_hash"] != hash_password(data.password):
        raise HTTPException(status_code=401, detail="Usuario o contrasena incorrectos")
    token = secrets.token_hex(32)
    active_sessions[token] = {"username": user["username"], "role": user["role"]}
    return {"token": token, "username": user["username"], "role": user["role"]}


@app.get("/api/users")
async def listar_usuarios(session: dict = Depends(verify_admin)):
    db = await get_db()
    cursor = await db.execute("SELECT id, username, role, created_at FROM users ORDER BY id")
    rows = await cursor.fetchall()
    users = [
        {"id": row["id"], "username": row["username"], "role": row["role"], "created_at": row["created_at"]}
        for row in rows
    ]
    await db.close()
    return users


@app.post("/api/users")
async def crear_usuario(user_data: UserCreate, session: dict = Depends(verify_admin)):
    db = await get_db()
    cursor = await db.execute("SELECT id FROM users WHERE username = ?", (user_data.username,))
    existing = await cursor.fetchone()
    if existing:
        await db.close()
        raise HTTPException(status_code=400, detail="El usuario ya existe")
    await db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        (user_data.username, hash_password(user_data.password), "vendedor")
    )
    await db.commit()
    await db.close()
    return {"message": "Usuario vendedor creado exitosamente"}


@app.delete("/api/users/{user_id}")
async def eliminar_usuario(user_id: int, session: dict = Depends(verify_admin)):
    db = await get_db()
    cursor = await db.execute("SELECT id, role FROM users WHERE id = ?", (user_id,))
    user = await cursor.fetchone()
    if not user:
        await db.close()
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user["role"] == "admin":
        await db.close()
        raise HTTPException(status_code=400, detail="No se puede eliminar un administrador")
    await db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    await db.commit()
    await db.close()
    return {"message": "Usuario eliminado exitosamente"}


@app.post("/api/visitas")
async def crear_visita(visita: VisitCreate, session: dict = Depends(verify_token)):
    db = await get_db()
    cursor = await db.execute(
        """INSERT INTO visitas (vendedor, cliente, telefono, fecha, hora, direccion, notas)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (visita.vendedor, visita.cliente, visita.telefono, visita.fecha, visita.hora, visita.direccion, visita.notas)
    )
    visita_id = cursor.lastrowid
    await db.commit()
    await db.close()
    return {"id": visita_id, "message": "Visita creada exitosamente"}


@app.get("/api/visitas")
async def listar_visitas(session: dict = Depends(verify_token)):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM visitas ORDER BY fecha DESC, hora DESC")
    rows = await cursor.fetchall()
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
    await db.close()
    return visitas


@app.get("/api/visitas/{visita_id}")
async def obtener_visita(visita_id: int, session: dict = Depends(verify_token)):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM visitas WHERE id = ?", (visita_id,))
    row = await cursor.fetchone()
    await db.close()
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
async def actualizar_visita(visita_id: int, visita: VisitUpdate, session: dict = Depends(verify_admin)):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM visitas WHERE id = ?", (visita_id,))
    existing = await cursor.fetchone()
    if not existing:
        await db.close()
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    updates = {}
    for field, value in visita.model_dump(exclude_unset=True).items():
        updates[field] = value
    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
        values = list(updates.values())
        values.append(visita_id)
        await db.execute(f"UPDATE visitas SET {set_clause} WHERE id = ?", values)
        await db.commit()
    await db.close()
    return {"message": "Visita actualizada exitosamente"}


@app.delete("/api/visitas/{visita_id}")
async def eliminar_visita(visita_id: int, session: dict = Depends(verify_admin)):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM visitas WHERE id = ?", (visita_id,))
    existing = await cursor.fetchone()
    if not existing:
        await db.close()
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    await db.execute("DELETE FROM visitas WHERE id = ?", (visita_id,))
    await db.commit()
    await db.close()
    return {"message": "Visita eliminada exitosamente"}


@app.patch("/api/visitas/{visita_id}/vendida")
async def marcar_vendida(visita_id: int, session: dict = Depends(verify_admin)):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM visitas WHERE id = ?", (visita_id,))
    existing = await cursor.fetchone()
    if not existing:
        await db.close()
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    new_value = not bool(existing["vendida"])
    await db.execute("UPDATE visitas SET vendida = ? WHERE id = ?", (new_value, visita_id))
    await db.commit()
    await db.close()
    return {"vendida": new_value, "message": "Estado de venta actualizado"}


# Serve frontend static files
STATIC_DIR = Path(__file__).parent.parent / "static"
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = STATIC_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        index_path = STATIC_DIR / "index.html"
        return FileResponse(str(index_path))
