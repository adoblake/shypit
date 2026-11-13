"""Publish a bounded, credential-redacted deployment error as an Actions annotation."""
import os
import re
import sys
from pathlib import Path

body = Path(sys.argv[1]).read_text(errors="replace")
secret = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
if secret:
    body = body.replace(secret, "[redacted]")
body = re.sub(r"\x1b\[[0-9;]*m", "", body)
body = re.sub(r"\b(?:sbp_|sb_secret_)[A-Za-z0-9_-]+", "[redacted]", body)
body = re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[redacted]", body)
body = " | ".join(line.strip() for line in body.splitlines() if line.strip())[:1600]
body = body.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
print("::error title=Authentication backend deployment::" + body)
