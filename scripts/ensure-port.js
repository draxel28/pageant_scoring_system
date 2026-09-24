const { execFileSync } = require('child_process');

const port = 3000;
const powershellScript = `
  $listeners = @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue)
  $results = @()
  foreach ($listener in $listeners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
    $results += [PSCustomObject]@{ processId = $listener.OwningProcess; commandLine = $process.CommandLine }
  }
  if ($results.Count -eq 0) { '[]' } else { $results | ConvertTo-Json -Compress }
`;

if (process.platform !== 'win32') {
  process.exit(0);
}

let output;
try {
  output = execFileSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-Command', powershellScript
  ], { encoding: 'utf8' }).trim();
} catch (error) {
  console.error('Could not inspect port 3000:', error.message);
  process.exit(1);
}

if (!output) process.exit(0);

const entries = Array.isArray(JSON.parse(output)) ? JSON.parse(output) : [JSON.parse(output)];
const pageantProcesses = entries.filter(entry => /server\.js/i.test(entry.commandLine || ''));

if (pageantProcesses.length !== entries.length) {
  console.error('Port 3000 is being used by another application. It was not stopped.');
  process.exit(1);
}

for (const entry of pageantProcesses) {
  try {
    execFileSync('taskkill.exe', ['/PID', String(entry.processId), '/T', '/F'], { stdio: 'ignore' });
  } catch (error) {
    console.error(`Could not stop existing pageant server (PID ${entry.processId}).`);
    process.exit(1);
  }
}
