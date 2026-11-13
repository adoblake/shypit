"""Validate credential status without outputting credentials or project metadata."""
import json
import urllib.error
import urllib.request
from auth_deploy_credentials import normalized_token, credential_problem

def fail(message):
    print('::error title=Supabase credential setup::' + message)
    raise SystemExit(1)

token = normalized_token()
problem = credential_problem(token)
if problem:
    fail(problem)
try:
    request = urllib.request.Request('https://api.supabase.com/v1/projects', headers={'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(request, timeout=20) as response:
        projects = json.load(response)
except urllib.error.HTTPError as error:
    fail('Supabase rejected this credential (HTTP ' + str(error.code) + '). Generate a fresh personal access token in the account that owns the Shypit project.')
except Exception:
    fail('Unable to validate Supabase management access. Check the token was copied completely and retry.')
if not isinstance(projects, list) or not any(project.get('id') == 'mzztaucyapmwlnuiljsv' or project.get('ref') == 'mzztaucyapmwlnuiljsv' for project in projects):
    fail('The credential authenticated, but its account cannot access the Shypit project. Use the account that owns that project.')
print('Supabase credential verified; Shypit project access confirmed.')
