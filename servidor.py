# Servidor local da app (http://localhost:8000), sem internet.
# Igual a "python3 -m http.server", mas diz ao browser para NUNCA guardar cópias antigas
# dos ficheiros (Safari e Chrome guardavam o CSS/JS antigo e as correcções não apareciam).
import http.server, socketserver, sys, os

PORTA = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class SemCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, *a):
        pass

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORTA), SemCache) as s:
    print('Vision app: http://localhost:%d/app/visao/Main.html  (Ctrl+C to stop)' % PORTA)
    s.serve_forever()
