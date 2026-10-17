import net from 'node:net';
import {spawn, spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const php = process.env.VAPA_PHP || 'php8.4';
const mailPath = (process.env.VAPA_TEST_AUTH_RUNTIME || root + 'codex/tmp/auth-fixture') + '/last-email.eml';
const setup = spawnSync(php, ['tests/fixtures/authentication/setup.php'], {cwd: root, stdio: 'inherit'});
if (setup.status !== 0) process.exit(1);
const smtp = net.createServer(socket => {
  socket.setEncoding('utf8');
  socket.write('220 synthetic.local ESMTP\r\n');
  let buffer = '', data = false, message = [];
  socket.on('data', chunk => {
    buffer += chunk;
    while (buffer.includes('\r\n')) {
      const index = buffer.indexOf('\r\n');
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 2);
      if (data) {
        if (line === '.') {
          writeFileSync(mailPath, message.join('\r\n'), {mode: 0o600});
          data = false; message = []; socket.write('250 accepted\r\n');
        } else message.push(line.startsWith('..') ? line.slice(1) : line);
      } else if (/^EHLO|^HELO/.test(line)) socket.write('250 synthetic.local\r\n');
      else if (/^DATA/.test(line)) { data = true; socket.write('354 send data\r\n'); }
      else if (/^QUIT/.test(line)) { socket.end('221 bye\r\n'); }
      else socket.write('250 OK\r\n');
    }
  });
  socket.on('error', () => {});
});
smtp.listen(8091, '127.0.0.1');
const child = spawn(php, ['-S', '127.0.0.1:8090', '-t', 'examples/demo-app/public', 'tests/fixtures/authentication/router.php'], {cwd: root, stdio: 'inherit'});
const stop = () => { child.kill('SIGTERM'); smtp.close(); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
child.on('exit', code => { smtp.close(); process.exit(code || 0); });
