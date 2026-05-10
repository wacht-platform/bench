// Static shell completion scripts for the `wacht` CLI.
// Generated dynamically from the known top-level commands so adding a command
// only requires updating the COMMANDS list below.

const COMMANDS = [
  'init',
  'login',
  'logout',
  'auth',
  'projects',
  'deployments',
  'users',
  'orgs',
  'workspaces',
  'skills',
  'mcp',
  'config',
  'api',
  'completion',
] as const;

const SUBCOMMANDS: Record<string, string[]> = {
  auth: ['status'],
  projects: ['list', 'create'],
  deployments: ['current', 'select', 'clear', 'create'],
  users: ['list', 'get', 'create'],
  orgs: ['list', 'get', 'create'],
  workspaces: ['list', 'get', 'create'],
  skills: ['install'],
  mcp: ['config'],
  config: ['pull', 'schema', 'template', 'diff', 'apply'],
  api: ['ls', 'describe', 'call', 'schema'],
  completion: ['bash', 'zsh', 'fish', 'powershell'],
};

export type CompletionShell = 'bash' | 'zsh' | 'fish' | 'powershell';

function bashScript(): string {
  const tops = COMMANDS.join(' ');
  const subs = Object.entries(SUBCOMMANDS)
    .map(([cmd, list]) => `      ${cmd}) COMPREPLY=($(compgen -W "${list.join(' ')}" -- "$cur")); return 0;;`)
    .join('\n');
  return `# bash completion for wacht
_wacht_complete() {
  local cur prev words cword
  _init_completion -n = || return

  if [[ $cword -eq 1 ]]; then
    COMPREPLY=($(compgen -W "${tops}" -- "$cur"))
    return 0
  fi

  if [[ $cword -eq 2 ]]; then
    case "\${words[1]}" in
${subs}
    esac
  fi

  COMPREPLY=()
}
complete -F _wacht_complete wacht
`;
}

function zshScript(): string {
  const cases = COMMANDS.map((cmd) => {
    const subs = SUBCOMMANDS[cmd];
    if (!subs) return `        ${cmd})  ;;`;
    const subList = subs.map((s) => `'${s}'`).join(' ');
    return `        ${cmd})\n          _values 'subcommand' ${subList}\n          ;;`;
  }).join('\n');
  return `#compdef wacht
# zsh completion for wacht
_wacht() {
  local context state line
  _arguments -C \\
    '1: :->command' \\
    '2: :->subcommand' \\
    '*::arg:->args'

  case $state in
    command)
      _values 'wacht command' ${COMMANDS.map((c) => `'${c}'`).join(' ')}
      ;;
    subcommand)
      case $words[2] in
${cases}
      esac
      ;;
  esac
}
_wacht "$@"
`;
}

function fishScript(): string {
  const lines: string[] = [`# fish completion for wacht`];
  for (const cmd of COMMANDS) {
    lines.push(`complete -c wacht -n '__fish_use_subcommand' -a '${cmd}'`);
  }
  for (const [cmd, subs] of Object.entries(SUBCOMMANDS)) {
    for (const sub of subs) {
      lines.push(`complete -c wacht -n '__fish_seen_subcommand_from ${cmd}' -a '${sub}'`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function powershellScript(): string {
  const tops = COMMANDS.join("','");
  const cases = Object.entries(SUBCOMMANDS)
    .map(([cmd, subs]) => `    '${cmd}' { @('${subs.join("','")}') }`)
    .join('\n');
  return `# PowerShell completion for wacht
Register-ArgumentCompleter -Native -CommandName wacht -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $tokens = $commandAst.CommandElements | ForEach-Object { $_.Value }
  if ($tokens.Length -le 2) {
    @('${tops}') | Where-Object { $_ -like "$wordToComplete*" } |
      ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
    return
  }
  $sub = switch ($tokens[1]) {
${cases}
    default { @() }
  }
  $sub | Where-Object { $_ -like "$wordToComplete*" } |
    ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
}
`;
}

export function completionScript(shell: CompletionShell): string {
  switch (shell) {
    case 'bash': return bashScript();
    case 'zsh': return zshScript();
    case 'fish': return fishScript();
    case 'powershell': return powershellScript();
  }
}
