#!/usr/bin/env python3
"""Check a production deployment, optionally using a dedicated test account."""
import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

origin = sys.argv[1].rstrip('/') if len(sys.argv) == 2 else ''
parsed = urllib.parse.urlsplit(origin)
if parsed.scheme != 'https' or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username:
    sys.exit('Usage: smoke.py https://your-domain.example')
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def request(path, body=None, expected=200):
    headers = {'Origin': origin}
    data = None
    if body is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(body).encode()
    req = urllib.request.Request(origin + path, data=data, headers=headers)
    try:
        response = client.open(req, timeout=140)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        if response.status != expected:
            sys.exit(f'{path}: got HTTP {response.status}, expected {expected}')
        if urllib.parse.urlsplit(response.url).netloc != parsed.netloc:
            sys.exit('Unexpected cross-origin redirect')
        raw = response.read()
        return json.loads(raw) if raw else None


with client.open(origin + '/', timeout=30) as homepage:
    if homepage.status != 200 or 'text/html' not in homepage.headers.get('Content-Type', ''):
        sys.exit('Homepage did not return HTML')
if request('/healthz') != {'status': 'ok', 'db': 'up'}:
    sys.exit('API/database is not healthy')
if request('/api/v1/public/demo') != {'enabled': False, 'accounts': []}:
    sys.exit('Demo access is enabled')
request('/api/v1/auth/me', expected=401)
email, password = os.getenv('SMOKE_EMAIL'), os.getenv('SMOKE_PASSWORD')
if bool(email) != bool(password):
    sys.exit('Set both SMOKE_EMAIL and SMOKE_PASSWORD')
if email:
    request('/api/v1/auth/login', {'email': email, 'password': password}, 204)
    session = next((cookie for cookie in jar if cookie.name == 'kilora_session'), None)
    if session is None or not session.secure or not session.has_nonstandard_attr('HttpOnly') or session.get_nonstandard_attr('SameSite', '').lower() != 'lax':
        sys.exit('Session cookie is missing Secure, HttpOnly or SameSite=Lax')
    request('/api/v1/auth/me')
    request('/api/v1/auth/logout', {}, 204)
    request('/api/v1/auth/me', expected=401)
    print('PASS: HTTPS, homepage, API routing, database, demo disabled and session lifecycle')
else:
    print('PASS: HTTPS, homepage, API routing, database and demo disabled')
    print('PENDING: session checks (set SMOKE_EMAIL and SMOKE_PASSWORD for a dedicated account)')
