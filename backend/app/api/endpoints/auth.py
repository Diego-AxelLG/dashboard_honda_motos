from fastapi import APIRouter

router = APIRouter()


@router.post("/login")
def login(username: str, password: str):
    """Placeholder — retorna un JWT dummy."""
    return {
        "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PLACEHOLDER",
        "token_type": "bearer",
    }
