"""Generate a VAPID key pair for Web Push (push reminders of the web app).

Run from the repository root and paste the two lines into `.env`:

    python scripts/generate_vapid_keys.py

The public key goes to browsers (the API hands it out), the private key signs pushes
(bot and API). Keep the private key secret. Generate the pair once: new keys make every
existing push subscription stop working, and users would have to allow notifications
again.
"""

from __future__ import annotations

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def generate() -> tuple[str, str]:
    """(public key, private key): an uncompressed P-256 point and the raw 32-byte
    private value, both base64url — the formats browsers and pywebpush expect."""
    private_key = ec.generate_private_key(ec.SECP256R1())
    private_raw = private_key.private_numbers().private_value.to_bytes(32, "big")
    public_raw = private_key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return _b64url(public_raw), _b64url(private_raw)


if __name__ == "__main__":
    public, private = generate()
    print(f"VAPID_PUBLIC_KEY={public}")
    print(f"VAPID_PRIVATE_KEY={private}")
