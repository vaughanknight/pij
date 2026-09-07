import http.server
import pathlib
import sys
import urllib.request
import urllib.error

upstream, port, output = sys.argv[1], int(sys.argv[2]), pathlib.Path(sys.argv[3])
output.mkdir(exist_ok=True)

class Proxy(http.server.BaseHTTPRequestHandler):
    sequence = 0
    def do_GET(self):
        self.forward()
    def do_POST(self):
        self.forward()
    def forward(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        request = urllib.request.Request(upstream + self.path, data=body if self.command == 'POST' else None,
            method=self.command, headers={'Authorization': self.headers.get('Authorization', ''), 'Content-Type': 'application/json'})
        try:
            response = urllib.request.urlopen(request, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        raw = response.read()
        if self.path == '/v1/bg':
            Proxy.sequence += 1
            (output / f'{Proxy.sequence:02}.response.json').write_bytes(raw)
            (output / f'{Proxy.sequence:02}.request.json').write_bytes(body)
        self.send_response(response.status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)
    def log_message(self, *args):
        pass

server = http.server.HTTPServer(('127.0.0.1', port), Proxy)
print('READY parity recorder', flush=True)
server.serve_forever()
