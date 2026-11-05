"""Credenciais Earth Engine isoladas por conta, sem alterar a autenticação geral.

Uso:
  python -m BETA_PYTHON.auth --login workspace2
  python -m BETA_PYTHON.auth --whoami workspace2 --project mapbiomas-brazil

Os tokens são gravados fora do repositório, em %APPDATA%/CCAL/credentials.
Não use este módulo para substituir ~/.config/earthengine/credentials.
"""
import argparse
import json
import os
from pathlib import Path
import sys

import ee
import ee.oauth
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
import requests

PROFILES = {
    'workspace2': 'mapbiomas.workspace2@gmail.com',
    'wallace': 'wallace.silva@ipam.org.br',
}


def credential_dir():
    base = os.environ.get('CCAL_CREDENTIALS_DIR')
    root = Path(base) if base else Path(os.environ.get('APPDATA', Path.home())) / 'CCAL' / 'credentials'
    root.mkdir(parents=True, exist_ok=True)
    return root


def credential_path(profile):
    if profile not in PROFILES:
        raise ValueError('perfil desconhecido: ' + profile)
    return credential_dir() / (profile + '.json')


def login(profile, port=0):
    target = credential_path(profile)
    if target.exists():
        raise RuntimeError('credencial já existe; remova manualmente para reautenticar: ' + str(target))
    flow = InstalledAppFlow.from_client_config({
        'installed': {
            'client_id': ee.oauth.CLIENT_ID,
            'client_secret': ee.oauth.CLIENT_SECRET,
            'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
            'token_uri': 'https://oauth2.googleapis.com/token',
            'redirect_uris': ['http://localhost'],
        }
    }, scopes=ee.oauth.SCOPES)
    # local_server abre o navegador; a escolha de conta acontece no Google.
    credentials = flow.run_local_server(port=port, prompt='select_account',
                                        authorization_prompt_message='Se o navegador não abrir, acesse: {url}',
                                        success_message='Autenticado. Você pode fechar esta janela.')
    payload = {
        'account_expected': PROFILES[profile],
        'refresh_token': credentials.refresh_token,
        'client_id': credentials.client_id,
        'client_secret': credentials.client_secret,
        'token_uri': credentials.token_uri,
        'scopes': credentials.scopes,
    }
    target.write_text(json.dumps(payload), encoding='utf-8')
    try:
        os.chmod(target, 0o600)
    except OSError:
        pass
    print('Credencial salva em', target)
    return credentials


def load(profile):
    path = credential_path(profile)
    if not path.exists():
        raise RuntimeError('credencial ausente; execute --login ' + profile)
    data = json.loads(path.read_text(encoding='utf-8'))
    return Credentials(None, refresh_token=data['refresh_token'], token_uri=data['token_uri'],
                       client_id=data['client_id'], client_secret=data['client_secret'],
                       scopes=data.get('scopes'))


def identity(credentials):
    """Retorna o e-mail da credencial via Drive about; userinfo exige escopo extra."""
    response = requests.get('https://www.googleapis.com/drive/v3/about',
                            params={'fields': 'user(emailAddress)'},
                            headers={'Authorization': 'Bearer ' + credentials.token}, timeout=20)
    if response.ok:
        return (response.json().get('user') or {}).get('emailAddress')
    return None


def whoami(profile, project):
    credentials = load(profile)
    credentials.refresh(Request())
    email = identity(credentials)
    print('Perfil:', profile, '| e-mail esperado:', PROFILES[profile])
    print('E-mail retornado pelo token:', email or 'não disponível')
    if email and email.lower() != PROFILES[profile].lower():
        print('ATENÇÃO: a conta autenticada difere da esperada.', file=sys.stderr)
        return 1
    ee.Initialize(credentials=credentials, project=project)
    roots = [x['id'] for x in ee.data.getAssetRoots()]
    print('Projeto:', project, '| raízes de assets acessíveis:', len(roots))
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--login', metavar='PERFIL')
    group.add_argument('--whoami', metavar='PERFIL')
    parser.add_argument('--project', default='mapbiomas-brazil')
    parser.add_argument('--port', type=int, default=0, help='porta local; 0 escolhe uma livre')
    args = parser.parse_args()
    if args.login:
        login(args.login, args.port)
        return 0
    return whoami(args.whoami, args.project)


if __name__ == '__main__':
    raise SystemExit(main())
