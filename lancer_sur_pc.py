import http.server
import socketserver
import webbrowser
import os
import sys
from pathlib import Path

PORT = 8765
ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

print('\nDark Romance Draw va demarrer.')
print('Si ton navigateur ne s\'ouvre pas automatiquement, copie cette adresse :')
print(f'http://localhost:{PORT}')
print('\nPour fermer l\'application : ferme cette fenetre noire.')
print('Ne panique pas, ce n\'est pas du piratage russe, juste un serveur local Python.\n')

try:
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        webbrowser.open(f'http://localhost:{PORT}')
        httpd.serve_forever()
except OSError as exc:
    print('\nImpossible de demarrer le serveur local.')
    print('Cause probable : le port est deja utilise ou Python est bloque.')
    print(exc)
    input('\nAppuie sur Entree pour fermer...')
