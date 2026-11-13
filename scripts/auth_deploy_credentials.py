"""Read deployment credentials locally within Actions; never log their values."""
import os
import re

def normalized_token():
    value = os.environ.get('SUPABASE_ACCESS_TOKEN', '').strip().strip('"').strip("'").strip()
    matches = set(re.findall(r'(?<![A-Za-z0-9_])sbp_[a-fA-F0-9]{40}(?![A-Za-z0-9_])', value))
    if len(matches) == 1:
        return next(iter(matches))
    return value

def credential_problem(value):
    if not value:
        return 'The deployment secret is empty.'
    if 'sb_publishable_' in value or 'sb_secret_' in value or value.startswith('eyJ'):
        return 'The saved value is a project API key. Replace it with a personal access token generated in Supabase Account Tokens.'
    if '...' in value or '\u2026' in value:
        return 'The saved value contains an ellipsis and is shortened. Copy the complete generated token using its Copy button.'
    if len(set(re.findall(r'sbp_[a-fA-F0-9]{40}', value))) > 1:
        return 'The saved value contains multiple tokens. Save exactly one complete personal access token.'
    if not value.startswith('sbp_'):
        return 'The saved value is not a Supabase personal access token. Generate it in Supabase Account Tokens and copy the generated value beginning sbp_.'
    return None
