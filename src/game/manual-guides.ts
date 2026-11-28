import type { ManualGuideEntry } from './manual-types.js';

export const MANUAL_GUIDES: readonly ManualGuideEntry[] = [
  {
    id: 'guide-chmod-numbers',
    title: 'Decoding `chmod` Numbers (755, 644, 444, 000)',
    subtitle: 'How Unix permission math actually works — zero memorization needed',
    section: 'guides',
    filters: ['beginner', 'flags-numbers', 'files', 'combat'],
    intro:
      'Every permission number in `chmod` is just three digits: Owner (u), Group (g), and Others (o). Each digit is the sum of 4 (read), 2 (write), and 1 (execute). Pick bits below to see the math live!',
    widget: 'chmod-calc',
    rows: [
      { token: '4 / 2 / 1', title: 'The Three Magic Weights (0..7 Digit Key)', summary: 'Read = 4 (r), Write = 2 (w), Execute = 1 (x), None = 0 (-).', detail: '7=rwx · 6=rw- · 5=r-x · 4=r-- · 3=-wx · 2=-w- · 1=--x · 0=---.' },
      { token: '755', title: 'rwxr-xr-x — Executable / Open Room', summary: 'Owner: 4+2+1=7 · Group: 4+0+1=5 · Others: 4+0+1=5', detail: 'Owner can read, modify, and run/enter; everyone else can read and run/enter.', example: 'chmod 755 iron_gate' },
      { token: '644', title: 'rw-r--r-- — Standard File / Decrypt Pickup', summary: 'Owner: 4+2=6 · Group: 4 · Others: 4', detail: 'Owner can read & edit; others can read only. Unlocks ransomware-encrypted mode-000 pickups.', example: 'chmod 644 energy.cell' },
      { token: '600 / 700', title: 'rw------- / rwx------ — Private Owner Only', summary: 'Owner: 6 (rw-) or 7 (rwx) · Group: 0 · Others: 0', detail: 'Real-world standard for SSH private keys (`600`), `.env` secrets (`600`), and `~/.ssh` (`700`).', example: 'chmod 600 secret.key' },
      { token: '444', title: 'r--r--r-- — Read-Only Armor', summary: 'Owner: 4 · Group: 4 · Others: 4', detail: 'Nobody can write or execute. Makes buffer-overflow targets segfault immediately (`chmod 444 stack.buf`).', example: 'chmod 444 stack.buf' },
      { token: '000', title: '--------- — Total Lockout', summary: 'Zero read, zero write, zero execute for all.', detail: 'Seals a port directory (`chmod 000 port_445`) so worms inside starve in 3 turns.', example: 'chmod 000 port_445' },
      { token: 'u/g/o +-= rwx', title: 'Symbolic Shorthand', summary: 'Change only one bit without touching the others.', detail: '`chmod -x trojan.bin` drops execute everywhere; `chmod +rx gate` adds read+enter; `chmod -w buf` blocks writes.', example: 'chmod -x stone_gargoyle.bin' },
    ],
    takeaways: [
      'On files, `x` means "run as a program". On directories, `x` means "allowed to `cd` into or traverse through it".',
      'Always check existing modes with `ls -l` before and after running `chmod`.',
    ],
    keywords: ['chmod', 'numbers', 'octal', '755', '644', '600', '700', '555', '444', '400', '000', '777', 'permissions', 'rwx', 'symbolic', 'math'],
  },
  {
    id: 'guide-kill-signals',
    title: 'POSIX Signals & Why `-9` Matters (`kill` / `pkill`)',
    subtitle: 'Why polite `kill <pid>` fails against stubborn malware — and what `-9`, `-15`, `-STOP`, `-CONT` do',
    section: 'guides',
    filters: ['beginner', 'flags-numbers', 'procs', 'combat'],
    intro:
      'In Unix, `kill` does not always mean "destroy" — it sends a numbered signal to a process. The default signal is `-15` (SIGTERM), which asks nicely. Use the interactive Signal Tester below to compare every signal.',
    widget: 'kill-signals',
    rows: [
      { token: '-15 (SIGTERM)', title: 'Default Signal — Polite Request', summary: 'Asks the process to flush files and exit cleanly.', detail: 'CAN BE TRAPPED OR IGNORED! `virus` ignores `-15`, and `forkbomb` (PID 666) traps it and strikes back for 18 HP.', example: 'kill -15 4001' },
      { token: '-9 (SIGKILL)', title: 'Untrappable Kernel Termination', summary: 'Handled directly by the OS kernel — the process never gets to react.', detail: 'CANNOT be caught, trapped, or ignored! Instantly destroys `virus` (and its split copies) and `forkbomb` + all zombie children.', example: 'kill -9 666' },
      { token: '-STOP (-19)', title: 'Freeze Process in Place (STAT=T)', summary: 'Suspends CPU execution immediately without terminating.', detail: 'Untrappable. Freezes `forkbomb` so it stops spawning zombies, or freezes `virus` so `rm` will not split it.', example: 'kill -STOP 666' },
      { token: '-CONT (-18)', title: 'Resume Frozen Process', summary: 'Wakes up a `STOP`ped process (`STAT=T` -> running).', detail: 'Pair with `ps` to inspect `STAT` before/after.', example: 'kill -CONT 666' },
      { token: 'UID = root', title: 'Why Signals Fail on PID 1 / Root', summary: 'Signals require matching user ownership (`dev`) unless you are `root`.', detail: 'Root-owned `exploit` or shielded PID 1 returns `Operation not permitted` — defeat `exploit` via `chmod -w stack.buf` instead!', example: 'chmod -w stack.buf' },
    ],
    takeaways: [
      'Always run `ps` first so you know exact `PID`, `PPID` (parent), `USER` (`dev` vs `root`), and `STAT` (`R/S/T/Z`).',
      'Use `kill -9 <PPID>` (or `pkill -9 -P <PPID>`) when a parent keeps spawning child processes.',
    ],
    keywords: ['kill', 'pkill', '-9', '-15', 'sigkill', 'sigterm', 'sigstop', 'sigcont', 'signal', 'trap', 'forkbomb', 'virus', 'zombie', 'pid'],
  },
  {
    id: 'guide-shell-syntax',
    title: 'Shell Pipelines, Redirects, Globs & Shortcuts',
    subtitle: 'Combine small Unix tools into surgical one-liners and move fast in the terminal',
    section: 'guides',
    filters: ['beginner', 'text', 'files'],
    intro:
      'You rarely solve a real terminal puzzle with one isolated command. Pipes (`|`), redirections (`>`, `>>`), chains (`&&`, `||`, `;`), globs (`*`, `?`), braces (`{a,b}`), and readline shortcuts turn simple commands into superpowers.',
    widget: 'shell-ops',
    rows: [
      { token: 'a | b', title: 'Pipe (stdout -> stdin)', summary: 'Feeds the text output of command `a` straight into command `b`.', detail: 'Error messages (stderr) stay on screen and never corrupt piped data!', example: 'grep "^PASS=" boiler.dump | cut -d= -f2 | rev' },
      { token: '>  /  >>', title: 'Output Redirection (Overwrite / Append)', summary: '`>` replaces file or writes to a `.sock` socket; `>>` appends to the end.', detail: 'Redirecting to `/dev/null` discards output or drains `.stream` hazards cleanly.', example: 'echo align > pressure_plate.sock' },
      { token: '&&  ||  ;', title: 'Command Chaining', summary: '`;` runs both; `&&` runs next ONLY if exit code = 0; `||` runs next ONLY on failure.', detail: 'In turn-based battles, a single chained line counts as ONE action!', example: 'rm -f .poltergeist.lock && touch cellar_hatch/.power_on && cd cellar_hatch' },
      { token: '*  ?  {a,b}', title: 'Globs & Brace Expansion', summary: '`*.log` matches all `.log` files; `?` matches 1 char; `{a,b,c}.rune` expands in classic mode.', detail: 'Wrap patterns in quotes (`"*.py"`) when passing them to `find -name` or `grep`. Note: brace expansion `{a,b}` is classic-shell only.', example: 'touch pedestal/{a,b,c}.rune' },
      { token: 'Tab / Ctrl+L / F1', title: 'Essential Keyboard Shortcuts', summary: '`Tab` completes commands/paths/topics · `Up/Down` history · `Ctrl+L` clear · `Ctrl+C` cancel line.', detail: '`Ctrl+A`/`E` jump start/end; `Ctrl+W` deletes word; `Ctrl+U`/`K` clears before/after cursor; `F1` toggles this Manual Book!', example: 'Tab / Ctrl+L / Ctrl+C / F1' },
    ],
    takeaways: [
      'A compound one-liner with `&&` executes multiple steps in a single combat turn — speedrunners love it.',
      'Press `Ctrl+L` to clear the terminal without spending a turn (`clear` typed as a command counts as a turn).',
    ],
    keywords: ['pipe', 'redirect', 'chain', 'glob', 'brace', 'shortcuts', 'tab', 'ctrl+l', 'ctrl+c', '&&', '||', '>>', '>', '|', 'devnull', 'oneliner'],
  },
  {
    id: 'guide-malware-matrix',
    title: 'Malware & Threat Counterplay Field Index',
    subtitle: 'Match the symptom on screen to the exact Unix command & flags that defeat it',
    section: 'guides',
    filters: ['combat', 'beginner', 'game'],
    intro:
      'Every enemy in Out Of Credits teaches a real Linux debugging or sysadmin concept. Match what you see (hidden dotfile, busy binary, respawning bug, trapped SIGTERM, root exploit) to the exact counter-command.',
    rows: [
      { token: '.spycam / .lock', title: 'Hidden Spyware & Rootkits', summary: 'Invisible to plain `ls` (`rootkit` hides from `ps` too!).', detail: 'Light your Tube Transistor with `ls -la` (or `kiro load deepseek && kiro scan`), then delete with `rm <dotfile>`.', example: 'ls -la && rm -f .poltergeist.lock' },
      { token: 'virus.exe', title: 'Self-Splitting Virus (Traps SIGTERM)', summary: 'Running `rm` while active splits it into two; `kill <pid>` is ignored.', detail: 'Run `ps`, then send untrappable `kill -9 <PID>` (also removes split copies), or `kill -STOP <PID>` then `rm`.', example: 'kill -9 <PID>' },
      { token: 'stone_gargoyle.bin', title: 'Trojan Binary (Relaunches on kill)', summary: 'Killing its PID only respawns it while `+x` remains set.', detail: 'Strip execute bit with `chmod -x <file>` to petrify it, or `chmod +w <file> && rm <file>`.', example: 'chmod -x stone_gargoyle.bin' },
      { token: 'stack.buf / proxy.buf', title: 'Root-Owned Buffer Overflow Exploit', summary: '`kill` says Operation not permitted (runs as `root`).', detail: 'You still own its `.buf` buffer! Make it read-only (`chmod -w` or `chmod 444`) so the overflow segfaults.', example: 'chmod 444 stack.buf' },
      { token: 'worm.bin / keygen', title: 'Port Worm & Lockpick Crack', summary: '`crack` picks closed ports open and resists `rm` ("Text file busy").', detail: 'Kill `crack` first (`ps` + `kill -9 <PID>`), then `chmod 000 port_445` (starves worm in 3 turns) or `rm`.', example: 'chmod 000 port_445' },
      { token: 'ransom.exe', title: 'Padlock Ransomware (Encrypts to 000)', summary: 'Locks nearby pickups (`*.cell/*.dimm/*.img`) to mode `000`.', detail: 'Kill ransomware (`ps` + `kill -9 <PID>`), then decrypt pickups with `chmod 644 <file>` before `source`.', example: 'chmod 644 energy.cell && source energy.cell' },
      { token: 'BUG in source', title: 'Code Bug & Forkbomb (`666`)', summary: 'Code bugs live in source files; Forkbomb forks zombies every 4 turns.', detail: 'Fix bugs with `grep BUG <file>` + `sed -i \'s/BUG/FIXED/\' <file>`, `vim`, or `edit`; terminate `666` with `kill -9 666`.', example: "sed -i 's/BUG/FIXED/' prod.py" },
    ],
    takeaways: [
      'Type `man <enemy>` (e.g. `man virus`) or `bestiary` anytime to review enemy stats.',
      'During combat you have 30s per turn — opening the Field Manual (`F1`) does NOT pause the battle clock, so search fast (`/`), hit `Insert`, and strike!',
    ],
    keywords: ['malware', 'virus', 'worm', 'trojan', 'bug', 'exploit', 'crack', 'ransomware', 'spyware', 'rootkit', 'zombie', 'forkbomb', 'kernel', 'counter', 'combat'],
  },
];
