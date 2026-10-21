# Snapshot file
# Unset all aliases to avoid conflicts with functions
unalias -a 2>/dev/null || true
shopt -u autocd
shopt -u assoc_expand_once
shopt -u cdable_vars
shopt -u cdspell
shopt -u checkhash
shopt -u checkjobs
shopt -s checkwinsize
shopt -s cmdhist
shopt -u compat31
shopt -u compat32
shopt -u compat40
shopt -u compat41
shopt -u compat42
shopt -u compat43
shopt -u compat44
shopt -s complete_fullquote
shopt -u direxpand
shopt -u dirspell
shopt -u dotglob
shopt -u execfail
shopt -u expand_aliases
shopt -u extdebug
shopt -u extglob
shopt -s extquote
shopt -u failglob
shopt -s force_fignore
shopt -s globasciiranges
shopt -s globskipdots
shopt -u globstar
shopt -u gnu_errfmt
shopt -u histappend
shopt -u histreedit
shopt -u histverify
shopt -s hostcomplete
shopt -u huponexit
shopt -u inherit_errexit
shopt -s interactive_comments
shopt -u lastpipe
shopt -u lithist
shopt -u localvar_inherit
shopt -u localvar_unset
shopt -s login_shell
shopt -u mailwarn
shopt -u no_empty_cmd_completion
shopt -u nocaseglob
shopt -u nocasematch
shopt -u noexpand_translation
shopt -u nullglob
shopt -s patsub_replacement
shopt -s progcomp
shopt -u progcomp_alias
shopt -s promptvars
shopt -u restricted_shell
shopt -u shift_verbose
shopt -s sourcepath
shopt -u varredir_close
shopt -u xpg_echo
# Functions
gawklibpath_append () 
{ 
    [ -z "$AWKLIBPATH" ] && AWKLIBPATH=`gawk 'BEGIN {print ENVIRON["AWKLIBPATH"]}'`;
    export AWKLIBPATH="$AWKLIBPATH:$*"
}
gawklibpath_default () 
{ 
    unset AWKLIBPATH;
    export AWKLIBPATH=`gawk 'BEGIN {print ENVIRON["AWKLIBPATH"]}'`
}
gawklibpath_prepend () 
{ 
    [ -z "$AWKLIBPATH" ] && AWKLIBPATH=`gawk 'BEGIN {print ENVIRON["AWKLIBPATH"]}'`;
    export AWKLIBPATH="$*:$AWKLIBPATH"
}
gawkpath_append () 
{ 
    [ -z "$AWKPATH" ] && AWKPATH=`gawk 'BEGIN {print ENVIRON["AWKPATH"]}'`;
    export AWKPATH="$AWKPATH:$*"
}
gawkpath_default () 
{ 
    unset AWKPATH;
    export AWKPATH=`gawk 'BEGIN {print ENVIRON["AWKPATH"]}'`
}
gawkpath_prepend () 
{ 
    [ -z "$AWKPATH" ] && AWKPATH=`gawk 'BEGIN {print ENVIRON["AWKPATH"]}'`;
    export AWKPATH="$*:$AWKPATH"
}

# setopts 3
set -o braceexpand
set -o hashall
set -o interactive-comments

# aliases 0

# exports (native declarations)
declare -x APPLICATION_INSIGHTS_NO_STATSBEAT="true"
declare -x BROWSER="/home/sanch/.vscode-server-61ade/.vscode-server/bin/6d62b1d5dace93a33b3a6d3eca1317bd5e15bcb1/bin/helpers/browser.sh"
declare -x CODEX_HOME="/space/share/libs/vapa/.codex"
declare -x CODEX_INTERNAL_ORIGINATOR_OVERRIDE="codex_vscode"
declare -x COPILOT_CLI_ENABLED_FEATURE_FLAGS="SHELL_SPAWN_BACKEND"
declare -x COPILOT_OTEL_FILE_EXPORTER_PATH="/dev/null"
declare -x DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/1000/bus"
declare -x DEBUG="release"
declare -x ELECTRON_RUN_AS_NODE="1"
declare -x HOME="/home/sanch"
declare -x LANG="en_US.UTF-8"
declare -x LESSCLOSE="/usr/bin/lesspipe %s %s"
declare -x LESSOPEN="| /usr/bin/lesspipe %s"
declare -x LOGNAME="sanch"
declare -x LS_COLORS=""
declare -x PATH="/space/share/libs/vapa/.codex/tmp/arg0/codex-arg0we8yAY:/home/sanch/.vscode-server-61ade/.vscode-server/bin/6d62b1d5dace93a33b3a6d3eca1317bd5e15bcb1/bin/remote-cli:/space/share/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin:/home/sanch/.vscode-server-61ade/.vscode-server/extensions/openai.chatgpt-26.1007.21434-linux-x64/bin/linux-x86_64"
declare -x PLAYWRIGHT_BROWSERS_PATH="/opt/infraadmin/playwright/browsers"
declare -x RUST_LOG="warn"
declare -x SHELL="/bin/bash"
declare -x SHLVL="1"
declare -x SSH_CLIENT="192.168.254.52 16303 22"
declare -x SSH_CONNECTION="192.168.254.52 16303 192.168.1.18 22"
declare -x USER="sanch"
declare -x VSCODE_CWD="/home/sanch"
declare -x VSCODE_ESM_ENTRYPOINT="vs/workbench/api/node/extensionHostProcess"
declare -x VSCODE_HANDLES_SIGPIPE="true"
declare -x VSCODE_HANDLES_UNCAUGHT_ERRORS="true"
declare -x VSCODE_IPC_HOOK_CLI="/run/user/1000/vscode-ipc-868e71d8-703e-431b-882a-3b81a0d20b0a.sock"
declare -x VSCODE_L10N_BUNDLE_LOCATION=""
declare -x VSCODE_NLS_CONFIG="{\"userLocale\":\"en\",\"osLocale\":\"en\",\"resolvedLanguage\":\"en\",\"defaultMessagesFile\":\"/home/sanch/.vscode-server-61ade/.vscode-server/bin/6d62b1d5dace93a33b3a6d3eca1317bd5e15bcb1/out/nls.messages.json\",\"locale\":\"en\",\"availableLanguages\":{}}"
declare -x VSCODE_RECONNECTION_GRACE_TIME="10800000"
declare -x XDG_RUNTIME_DIR="/run/user/1000"
declare -x XDG_SESSION_CLASS="user"
declare -x XDG_SESSION_ID="304791"
declare -x XDG_SESSION_TYPE="tty"
