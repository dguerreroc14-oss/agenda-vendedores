from fastapi import FastAPI

app = FastAPI()

@app.get("/api/healthz")
def healthz():
    return {"status": "ok", "message": "minimal test"}
