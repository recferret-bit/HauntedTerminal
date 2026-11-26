import type { DossierEntry } from './types.js';

export interface RigPerkSpec {
  id: string;
  title: string;
  bashrcLine: string;
  costScrap: number;
  effectSummary: string;
}

export const RIG_PERKS: readonly RigPerkSpec[] = [
  {
    id: 'perk-overclock-dimm',
    title: 'Overclocked Starter DIMM',
    bashrcLine: 'export RIG_RAM_BOOT=16',
    costScrap: 40,
    effectSummary: '+16 GB RAM (+10 Max HP) pre-installed at the start of every mission.',
  },
  {
    id: 'perk-nvme-snapshot',
    title: 'NVMe Rescue Partition',
    bashrcLine: 'export RIG_SSD_RESCUE=256',
    costScrap: 60,
    effectSummary: '+256 GB SSD (1 instant in-place respawn backup) on every mission.',
  },
  {
    id: 'perk-linter-goggles',
    title: 'Dotfile Linter Goggles',
    bashrcLine: 'export PS_LANTERN=1',
    costScrap: 50,
    effectSummary: 'Auto-illuminates hidden dotfiles & rootkits upon entering each sector.',
  },
];

export interface GrimoireEntry {
  command: string;
  category: 'POSIX' | 'HTML/CSS' | 'JS/CODE' | 'DOCKER';
  syntax: string;
  realWorld: string;
  comicEffect: string;
}

export const GRIMOIRE_ENTRIES: readonly GrimoireEntry[] = [
  {
    command: 'ls',
    category: 'POSIX',
    syntax: 'ls -la',
    realWorld: 'Lists directory contents including hidden `.dotfiles` and octal/rwx permissions.',
    comicEffect: 'Raises the Lantern sweep—exposes cloaked `.spycam` spyware & `.poltergeist.lock` rootkits.',
  },
  {
    command: 'cat',
    category: 'POSIX',
    syntax: 'cat client_brief.txt | cat hank.tty.sock',
    realWorld: 'Streams file or Unix domain socket output to stdout.',
    comicEffect: 'Reads contracts/configs or opens Socratic comic dialogue with mentor `hank.tty`.',
  },
  {
    command: 'rm',
    category: 'POSIX',
    syntax: 'rm .env.ai_dump port_445/worm.bin',
    realWorld: 'Unlinks files from their parent directory inode.',
    comicEffect: 'Shreds exposed secret dumps, lockfiles, and file-bound worms.',
  },
  {
    command: 'chmod',
    category: 'POSIX',
    syntax: 'chmod +rx ssl_certs | chmod -x skimmer.bin | chmod -w proxy.buf',
    realWorld: 'Modifies read (`r`), write (`w`), and execute (`x`) permission bits.',
    comicEffect: 'Unlocks `000` cert vaults, petrifies trojans into harmless stone, and starves buffer exploits.',
  },
  {
    command: 'ps',
    category: 'POSIX',
    syntax: 'ps | top',
    realWorld: 'Snapshots active processes, PIDs, PPIDs, and CPU load.',
    comicEffect: 'Activates `PS_XRAY` HUD tags over live malware processes so you can target their PID.',
  },
  {
    command: 'kill',
    category: 'POSIX',
    syntax: 'kill -9 <PID> | kill -STOP <PID>',
    realWorld: 'Delivers POSIX signals (`SIGKILL` = `-9`, `SIGTERM` = `-15`, `SIGSTOP` = freeze).',
    comicEffect: 'Calls a comic lightning bolt onto traps-SIGTERM viruses, cracks, and ransomware.',
  },
  {
    command: 'grep',
    category: 'POSIX',
    syntax: 'grep ORDER_SIG stripe_audit.log > payment_verify.sock',
    realWorld: 'Filters lines matching a pattern and redirects stdout into files or sockets.',
    comicEffect: 'Extracts verified payment tokens out of noisy logs straight into socket locks.',
  },
  {
    command: 'sed',
    category: 'JS/CODE',
    syntax: "sed -i 's|old|new|g' store.conf",
    realWorld: 'Non-interactive stream editor; supports any delimiter (`s/a/b/` or `s|url1|url2|`).',
    comicEffect: 'Patches broken ports, config flags, and code bugs in a single speedrun keystroke.',
  },
  {
    command: 'edit',
    category: 'HTML/CSS',
    syntax: 'edit storefront.css | edit cart.js',
    realWorld: 'Opens the Split Code Mini-Editor inside the terminal dock (`Ctrl+S` saves & lints).',
    comicEffect: 'Restores hidden CSS `.product-grid` cards, fixes JS string-concatenation math, and squashes `malware.bug`.',
  },
  {
    command: 'docker build',
    category: 'DOCKER',
    syntax: 'docker build -t byterig-web:1.0 . && docker run -d -p 3000:3000 byterig-web:1.0',
    realWorld: 'Builds an immutable container image from a `Dockerfile` and maps host->container ports.',
    comicEffect: 'Replaces hallucinated `node:99-vibe-turbo` layers and materializes `[UP]` container crates on stage.',
  },
  {
    command: 'docker compose',
    category: 'DOCKER',
    syntax: 'docker compose config && docker compose up -d',
    realWorld: 'Validates and orchestrates multi-container networks (`nginx` + `website` + `payment`) with DNS discovery.',
    comicEffect: 'Wires `http://payment:4002` across containers and spawns all 3 healthy service crates.',
  },
  {
    command: 'workshop',
    category: 'POSIX',
    syntax: 'workshop [buy|toggle <perk>]',
    realWorld: 'Manages persistent `.bashrc` workstation upgrades purchased with Silicon Scrap.',
    comicEffect: 'Equips Overclocked Starter RAM, NVMe Rescue Backups, or Dotfile Linter Goggles.',
  },
  {
    command: 'kiro',
    category: 'POSIX',
    syntax: 'kiro [scan | load <qwen|mistral|deepseek|llama> | crack <lock> | disclaimer] | cat <file> | kiro',
    realWorld: 'Runs air-gapped, self-hosted `.gguf` open-weights inference locally on your own GPU VRAM.',
    comicEffect: 'Unfolds your Destiny-style Kiro Ghost shell to scan rooms, hot-swap cores, audit files, and decrypt Cloud locks!',
  },
  {
    command: 'inventory',
    category: 'POSIX',
    syntax: 'inventory | inv',
    realWorld: 'Inspects carried developer equipment and tools.',
    comicEffect: 'Lists carried gear (* indicates held item in hand): lantern, terminal, laptop, manual, and map.',
  },
  {
    command: 'hold',
    category: 'POSIX',
    syntax: 'hold <lantern|terminal|laptop|manual|map>',
    realWorld: 'Equips or switches active tool into the screen-right hand.',
    comicEffect: 'Changes developer visual model and active capabilities (lantern casts light; laptop opens coding lab; manual equips field book; map equips motherboard map).',
  },
  {
    command: 'achievements',
    category: 'POSIX',
    syntax: 'achievements [export | sync | <category>]',
    realWorld: 'Inspects persistent local achievement trophies and exports 1:1 Steamworks `ACH_*` unlock payloads.',
    comicEffect: 'Stamps unlocked comic trophies onto your dossier and syncs with the Tauri + Steamworks desktop bridge.',
  },
];

/** Cards every chapter shares (engine companions and the malware roster). A chapter adds its own through `manifest.dossier`. */
export const BESTIARY_DOSSIER: readonly DossierEntry[] = [
  {
    id: 'hank.tty',
    name: 'hank.tty (1978 Greybeard Spirit)',
    model: 'door.socket',
    role: 'ALLY',
    hostHardware: 'Vintage RS-232 / Unix domain socket with phosphor status LEDs.',
    counterplay: '`hank` or `cat hank.tty.sock` for 3-rung Socratic hints; `echo status > hank.tty.sock` for live audit.',
  },
  {
    id: 'kiro.d',
    name: 'kiro.d ("Little Weights" Ghost Companion)',
    model: 'npc.kiro_ghost',
    role: 'ALLY',
    hostHardware: 'Classic white sheet Kiro Ghost with scalloped hem folds, dark oval eyes with cyan .gguf iris sparks, and orbiting gold VRAM shards.',
    counterplay: '`kiro scan` sweeps threats; `kiro load <qwen|mistral|deepseek|llama>` boots open-weight models to disable the Big Four; `kiro crack <lock>` decrypts Cloud gates.',
  },
  {
    id: 'spyware',
    name: 'Cloaked Spycam (.spycam)',
    model: 'malware.spyware',
    role: 'MALWARE',
    hostHardware: 'Hidden dotfile camera lens lurking in repo dark corners.',
    counterplay: 'Reveal with `ls -la` (Lantern), then `rm .spycam`.',
  },
  {
    id: 'rootkit',
    name: 'Poltergeist Lock (.poltergeist.lock)',
    model: 'malware.rootkit',
    role: 'MALWARE',
    hostHardware: 'Sub-floor kernel latch hiding as a dotfile.',
    counterplay: 'Sweep with `ls -la`, then `rm .poltergeist.lock`.',
  },
  {
    id: 'bug',
    name: 'Code Bug (seed_products.py / cart.js)',
    model: 'malware.bug',
    role: 'MALWARE',
    hostHardware: 'Six-legged IC centipede living inside broken source code; respawns if `kill`ed!',
    counterplay: 'Patch the bug in source code via `edit <file>` or `sed -i`.',
  },
  {
    id: 'crack',
    name: 'Keygen Lockpick (keygen.exe)',
    model: 'malware.crack',
    role: 'MALWARE',
    hostHardware: 'Bent jumper-pin lockpick process reopening vulnerable ports.',
    counterplay: 'Check `ps` for its PID and run `kill -9 <PID>` before cleaning the port.',
  },
  {
    id: 'worm',
    name: 'Port Worm (worm.bin)',
    model: 'malware.worm',
    role: 'MALWARE',
    hostHardware: 'Segmented ribbon-cable crawler replicating through open port directories.',
    counterplay: 'Kill any helper crack process, then `rm port_445/worm.bin` or `chmod 000` its port.',
  },
  {
    id: 'virus',
    name: ' Trap-SIGTERM Virus (virus.exe)',
    model: 'malware.virus',
    role: 'MALWARE',
    hostHardware: 'Spiked heatsink phage that shrugs off polite `SIGTERM` (`kill -15`).',
    counterplay: 'Run `ps` and execute `kill -9 <PID>` (`SIGKILL` cannot be trapped).',
  },
  {
    id: 'trojan',
    name: 'Price Skimmer Trojan (price_skimmer.bin)',
    model: 'malware.trojan',
    role: 'MALWARE',
    hostHardware: 'Gift-wrapped capacitor disguising a credential/cart skimmer.',
    counterplay: 'Strip its execute bit with `chmod -x price_skimmer.bin` to petrify it into stone!',
  },
  {
    id: 'ransomware',
    name: 'Padlock Ransomware (ransom.exe)',
    model: 'malware.ransomware',
    role: 'MALWARE',
    hostHardware: 'Chained padlock daemon encrypting files in the Docker build context.',
    counterplay: 'Find its PID with `ps`, terminate with `kill -9 <PID>`, and `chmod 644` any locked files.',
  },
  {
    id: 'exploit',
    name: 'Buffer Overflow Exploit (port_hijack.bin)',
    model: 'malware.exploit',
    role: 'MALWARE',
    hostHardware: 'Root-escalated syringe injecting shellcode into a writable `.buf` file.',
    counterplay: 'Make its target buffer read-only (`chmod -w proxy.buf`) so it segfaults!',
  },
  {
    id: 'kernel',
    name: 'Slop-Weaver Codec (slop_supervisor.ko, PID 1)',
    model: 'boss.kernel',
    role: 'BOSS',
    hostHardware: 'Monolithic autonomous AI supervisor gripping live cart checkout.',
    counterplay: '1) Drain `.stream` -> `/dev/null`, 2) Pipe `ORDER_SIG` -> `payment_verify.sock`, 3) Flip `slop_override=false`, 4) `exit`!',
  },
];
