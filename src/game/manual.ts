/** `help` and `man` text. Short, because the player reads it mid-fight. */
import { BESTIARY, type EnemyType } from './bestiary.js';
import { empty, out } from './play.js';
import type { Step } from './shell.js';

export const COMMANDS = [
  'pwd', 'ls', 'cd', 'cat', 'readlink', 'find', 'touch', 'rm', 'mv', 'cp', 'chmod', 'ln',
  'echo', 'grep', 'wc', 'cut', 'rev', 'sed', 'head', 'tail', 'ps', 'top', 'kill', 'pkill',
  'source', '.', 'kiro', 'help', 'man', 'status', 'whoami', 'tutorial', 'clear', 'exit', 'logout',
  'inventory', 'inv', 'hold',
];

export function helpText(hint: string): string {
  return [
    '\x1b[1;93mHAUNTED TERMINAL\x1b[0m: every command is a step or a swing.',
    '  look   pwd  ls [-a -l]  cat  readlink  find [-name -type]  ps [aux]  top  status',
    '  move   cd <dir>  cd ..  cd ../../..  cd -',
    '  files  touch  rm [-r -f]  mv  cp  chmod  ln -s  echo',
    '  text   grep [-h -c -i -v -n]  wc [-l]  cut -d -f  rev  sed [-i]  head  tail [-n]',
    '  fight  kill [-9 -15 -STOP -CONT] <pid>  pkill <name>     (ps shows the PIDs)',
    '  loot   source <file>  or  . <file>   (*.cell heal, *.dimm RAM, *.img SSD backup)',
    '  ghost  kiro [scan | load <qwen|mistral|deepseek|llama> | crack <lock>]   cat <file> | kiro',
    '  shell  ;  &&  ||  |  >  >>   globs *.log   braces {a,b,c}.rune   Tab completes',
    '  carry  inventory (inv)   hold <item>   (ls -a raises the lantern)',
    '  tutorial  the agents\' current prompt   (tutorial skip skips the onboarding)',
    '  man <command>, or man <malware>: virus worm trojan bug exploit crack ransomware spyware rootkit zombie forkbomb kernel',
    `\x1b[1;96mHint:\x1b[0m ${hint}`,
  ].join('\n');
}

const MAN: Record<string, string[]> = {
  pwd: ['pwd: print the room you are standing in (the working directory).'],
  ls: [
    'ls [-a] [-l] [path...]: list a room.',
    '  -a  light the lantern: dotfiles show, and so does malware hiding as one.',
    '  -l  long format: mode (rwx), owner, size, symlink targets (mirrors that lie).',
  ],
  cd: [
    'cd <dir>: walk into a room. Absolute (/var/dungeon) or relative (desk, ../..).',
    '  cd ..          one room up.   cd ../../..  smash up three panels at once.',
    '  cd -           back to where you were.',
    '  Symlinks are followed; a loop fails with "too many levels of symbolic links".',
  ],
  cat: [
    'cat <file>...: print files. With no file, prints stdin.',
    '  cat <name>.sock   lets a talking socket speak.',
    '  cat <malware>     leaks the strings inside a binary. Read your enemies.',
  ],
  readlink: ['readlink <link>: where a symlink really points. Mirrors that point at themselves are traps.'],
  find: ['find [dir] [-name "<pattern>"] [-type f|d]: search a subtree. Patterns take * and ?.'],
  touch: ['touch <file>...: create empty files (a rune, a fuse, a .power_on).'],
  rm: [
    'rm [-f] [-r] <path>...: delete. -r for rooms, -f to ignore what is missing.',
    '  Most malware dies when its file goes. A running virus splits instead; root-owned code refuses.',
  ],
  mv: [
    'mv <src> <dest>: move or rename.',
    '  mv <file> /dev/null   destroys it.     mv <pickup> ~   collects a pickup.',
  ],
  cp: ['cp <src> <dest>: copy a file. Pickups are copy-protected.'],
  chmod: [
    'chmod <mode> <path>...: change permissions.',
    '  octal:     755  644  555  444  000',
    '  symbolic:  +x -x +w -w +r +rx u+x go-w a=r   (comma lists work: u+x,g-w)',
    '  No x on a binary: it stops running.  No x on a room: nothing gets through (a worm starves).',
    '  No w on a buffer: an overflow segfaults.  chmod 644 decrypts what ransomware locked.',
  ],
  ln: ['ln -s <target> <name>: make a symlink.'],
  echo: ['echo [-n] <text>: print text. echo align > pressure_plate.sock talks to a socket.'],
  grep: [
    'grep [-h] [-c] [-i] [-v] [-n] <pattern> [file...]: print matching lines (regex).',
    '  -h  no file names   -c  count   -i  ignore case   -v  invert   -n  line numbers',
  ],
  wc: ['wc [-l] [-w] [-c] [file...]: count lines, words, characters. wc -l counts lines.'],
  cut: ['cut -d<delim> -f<list> [file]: cut fields. -d= -f2 takes what follows "=". Lists: -f1,3  -f2-'],
  rev: ['rev [file]: reverse every line. Some passwords are stored backwards.'],
  sed: [
    "sed [-i] 's/old/new/[g]' [file...]: stream edit (regex). -i edits the file in place.",
    "  sed -i 's/BUG/FIXED/' prod.py     is how you squash a bug.",
  ],
  head: ['head [-n N | -N] [file]: the first N lines (default 10).'],
  tail: ['tail [-n N | -N] [file]: the last N lines (default 10).'],
  ps: ['ps [aux]: the process table, with PIDs. Turns on the PS_XRAY visor. Processes cannot hide here (rootkits can).'],
  top: ['top: a live snapshot of processes, CPU and your memory. Same visor as ps.'],
  kill: [
    'kill [-SIGNAL] <pid>...: send a signal.',
    '  -15 / -TERM (default)  ask nicely. Some malware traps it.',
    '  -9  / -KILL            cannot be trapped. Kills the children of a parent too.',
    '  -STOP / -CONT          freeze and thaw.        kill -l lists signals.',
    '  Root-owned processes answer: Operation not permitted.',
  ],
  pkill: [
    'pkill [-SIGNAL] [-f] [-x] [-P ppid] <pattern>: signal matching processes.',
    '  -f  match full command line   -x  exact match   -P <ppid>  only children of <ppid>.',
  ],
  source: [
    'source <file>  (or: . <file>): load a pickup into yourself.',
    '  *.cell  energy: +25 HP          *.dimm  RAM: +16 GB, +10 max HP',
    '  *.img   SSD: +256 GB = one backup (die with one and you restore in place at half HP)',
    '  Encrypted pickups (mode 000) need chmod 644 first. Never source malware.',
  ],
  kiro: [
    'kiro: your air-gapped, self-hosted .gguf Ghost companion (kiro.d).',
    '  kiro                          inspect mounted .gguf core, VRAM budget & active buffs.',
    '  kiro scan                     sweep room threats, hidden dotfiles & corrupt configs.',
    '  kiro load <core>              swap local weights: qwen (vs Anti-Gravy), mistral (vs Clod),',
    '                                deepseek (vs Codec), llama (vs Gork Faraday shield).',
    '  kiro crack <lock>             send Kiro to decrypt a Cloud-sealed gate while you defend it.',
    '  kiro disclaimer               print the parody & non-affiliation notice (alias: kiro legal).',
    '  cat <file> | kiro             audit a file with local weights (flags bugs & slop).',
  ],
  help: ['help: the cheat sheet and a hint for this room.'],
  man: ['man <command> | man <malware>: the manual.'],
  status: ['status: HP, RAM, SSD backups, malware left on this floor, where you are.'],
  whoami: ['whoami: who you are in here.'],
  inventory: ['inventory (inv): what you carry; * marks the item in your hand.'],
  inv: ['inv: short for inventory.'],
  hold: ['hold <item>: take an item you carry in your hand (hold lantern, hold laptop).'],
  tutorial: ['tutorial: show the agents\' current prompt.   tutorial skip: skip the onboarding.'],
  clear: ['clear: wipe the terminal (Ctrl+L).'],
  exit: ['exit / logout: leave the machine. Only works once the kernel lets go of you.'],
  mkdir: ['mkdir [-p] <dir>...: create directories. -p creates parent rooms too.'],
  edit: ['edit <file>  (aliases: nano, vim, code): open the Split Code Mini-Editor (Ctrl+S saves).'],
  docker: [
    'docker: container image and Compose tools.',
    '  docker build -t <tag> .              build a Dockerfile into an image.',
    '  docker run -d -p <h>:<c> <tag>       launch a container with host:container port mapping.',
    '  docker compose config | up -d        validate or start a multi-service stack.',
  ],
  hank: ['hank [status]: ask your greybeard ally for a Socratic hint, or audit the mission checklist.'],
  tactical: ['tactical [on|off]: toggle turn-based Tactical Mode (enemies move one step per command).'],
  grimoire: ['grimoire [<command>]: inspect unlocked Unix, code and Docker commands.'],
  bestiary: ['bestiary [<id>]: inspect known allies and malware hardware counterplay.'],
  workshop: ['workshop [<perk>]: view Silicon Scrap and toggle ~/.bashrc Rig Perks.'],
};
MAN['.'] = MAN.source ?? [];
MAN.logout = MAN.exit ?? [];
MAN.nano = MAN.edit ?? [];
MAN.vim = MAN.edit ?? [];
MAN.code = MAN.edit ?? [];
MAN['docker-compose'] = MAN.docker ?? [];
MAN.dossier = MAN.bestiary ?? [];
MAN.rig = MAN.workshop ?? [];

const ALIASES: Record<string, EnemyType> = {
  virus: 'virus', worm: 'worm', trojan: 'trojan', gargoyle: 'trojan', bug: 'bug', exploit: 'exploit',
  crack: 'crack', keygen: 'crack', ransomware: 'ransomware', ransom: 'ransomware', spyware: 'spyware',
  spycam: 'spyware', rootkit: 'rootkit', poltergeist: 'rootkit', mimic: 'rootkit', zombie: 'zombie',
  zombie_worker: 'zombie', forkbomb: 'forkbomb', necromancer: 'forkbomb', necromancer_forkd: 'forkbomb',
  kernel: 'kernel', kernel_overlord: 'kernel', overlord: 'kernel',
};

/** `man <topic>`: a command page or a bestiary page. Null when there is no entry. */
export function manPage(topic: string): string | null {
  const page = MAN[topic];
  if (page) return page.join('\n');
  const type = ALIASES[topic.toLowerCase()];
  if (type) return BESTIARY[type].man.join('\n');
  return null;
}

export function runMan(args: string[]): Step {
  const topic = args[0];
  if (!topic) return empty(1, 'What manual page do you want?\nFor example, try \'man kill\' or \'man virus\'.\n');
  const page = manPage(topic);
  if (!page) return empty(16, `No manual entry for ${topic}\n`);
  return out(`${page}\n`);
}

export const SIGNAL_LIST = ' 9) SIGKILL  15) SIGTERM  19) SIGSTOP  18) SIGCONT';
