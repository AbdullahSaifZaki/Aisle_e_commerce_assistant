import os

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError
import ssl
import certifi
from jwt import PyJWKClient,PyJWKClientConnectionError,PyJWTError


load_dotenv()

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN")
AUTH0_AUDIENCE = os.getenv("AUTH0_AUDIENCE")

ALGORITHMS = ["RS256"]

security = HTTPBearer()

JWKS_URL = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"

jwks_client = PyJWKClient(
    JWKS_URL,
    cache_jwk_set=True,
    lifespan=300,  
    timeout=10,
    ssl_context=ssl.create_default_context(
        cafile=certifi.where()
    ),
)

def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    token = credentials.credentials

    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=ALGORITHMS,
            audience=AUTH0_AUDIENCE,
            issuer=f"https://{AUTH0_DOMAIN}/",
            options={
                "require_exp": True,
                "require_sub": True,
            },
        )

        subject = payload.get("sub")
        if not isinstance(subject, str) or not subject.strip():
            raise HTTPException(
                status_code=401,
                detail="Token is missing a valid user ID",
            )

        return payload

    except PyJWKClientConnectionError:
        raise HTTPException(
            status_code=503,
            detail="Authentication service is temporarily unavailable",
        ) from None

    except (JWTError, PyJWTError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
