#!/bin/sh
set -eu

# Installs the Node-based Prose CLI from a verified release tarball.
DEFAULT_VERSION="0.1.4"
DEFAULT_REPO_URL="https://github.com/openprose/prose"

log() {
	printf '%s\n' "$*" >&2
}

fail() {
	log "prose install: $*"
	exit 1
}

need_command() {
	command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

safe_label() {
	case "$2" in
		""|*[!A-Za-z0-9._-]*)
			fail "$1 may only contain letters, numbers, dots, underscores, and dashes"
			;;
	esac
}

safe_sha256() {
	case "$1" in
		*[!A-Fa-f0-9]*|"")
			fail "$2 must be a 64-character SHA-256 hex digest"
			;;
	esac
	[ "${#1}" -eq 64 ] || fail "$2 must be a 64-character SHA-256 hex digest"
}

detect_os() {
	uname_s=$(uname -s 2>/dev/null || true)
	case "$uname_s" in
		Darwin) printf 'darwin' ;;
		Linux) printf 'linux' ;;
		*) fail "unsupported OS: ${uname_s:-unknown}. Set PROSE_OS to override." ;;
	esac
}

detect_arch() {
	uname_m=$(uname -m 2>/dev/null || true)
	case "$uname_m" in
		arm64|aarch64) printf 'arm64' ;;
		x86_64|amd64) printf 'x64' ;;
		*) fail "unsupported architecture: ${uname_m:-unknown}. Set PROSE_ARCH to override." ;;
	esac
}

make_absolute() {
	case "$1" in
		/*) printf '%s' "$1" ;;
		*) printf '%s/%s' "$(pwd)" "$1" ;;
	esac
}

shell_single_quote_body() {
	printf '%s' "$1" | sed "s/'/'\\\\''/g"
}

download_to() {
	case "$download_command" in
		curl) curl -fsSL "$1" -o "$2" ;;
		wget) wget -qO "$2" "$1" ;;
	esac
}

raw_version=${PROSE_VERSION:-$DEFAULT_VERSION}
case "$raw_version" in
	v*) prose_version=${raw_version#v} ;;
	*) prose_version=$raw_version ;;
esac

if [ -n "${PROSE_OS:-}" ]; then
	prose_os=$PROSE_OS
else
	prose_os=$(detect_os)
fi

if [ -n "${PROSE_ARCH:-}" ]; then
	prose_arch=$PROSE_ARCH
else
	prose_arch=$(detect_arch)
fi

safe_label "PROSE_VERSION" "$prose_version"
safe_label "PROSE_OS" "$prose_os"
safe_label "PROSE_ARCH" "$prose_arch"

if [ -n "${PROSE_RELEASE_TAG:-}" ]; then
	release_tag=$PROSE_RELEASE_TAG
else
	release_tag="v$prose_version"
fi

if [ -n "${PROSE_BASE_URL:-}" ]; then
	base_url=${PROSE_BASE_URL%/}
else
	base_url="$DEFAULT_REPO_URL/releases/download/$release_tag"
fi

asset_name="prose-$prose_version-$prose_os-$prose_arch.tar.gz"
package_name="prose-$prose_version-$prose_os-$prose_arch"

if [ -n "${PROSE_TARBALL_URL:-}" ]; then
	tarball_url=$PROSE_TARBALL_URL
else
	tarball_url="$base_url/$asset_name"
fi

if [ -n "${PROSE_SHA256_URL:-}" ]; then
	sha256_url=$PROSE_SHA256_URL
else
	sha256_url="$tarball_url.sha256"
fi

install_root=$(make_absolute "${PROSE_INSTALL_DIR:-$HOME/.local/share/prose}")
bin_dir=$(make_absolute "${PROSE_BIN_DIR:-$HOME/.local/bin}")
target_dir="$install_root/$package_name"
shim_path="$bin_dir/prose"

case "${PROSE_DRY_RUN:-0}" in
	1|true|TRUE|yes|YES)
		log "prose install dry run"
		log "Would download: $tarball_url"
		if [ -n "${PROSE_SHA256:-}" ]; then
			log "Would verify SHA256: $PROSE_SHA256"
		elif [ "${PROSE_SKIP_SHA256:-0}" = "1" ]; then
			log "Would skip SHA256 verification"
		else
			log "Would download checksum: $sha256_url"
		fi
		log "Would install: $target_dir"
		log "Would write shim: $shim_path"
		exit 0
		;;
esac

need_command tar
need_command sed
need_command mktemp
need_command find
need_command node

node_major=$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || printf '0')
case "$node_major" in
	""|*[!0-9]*) fail "unable to determine Node.js version" ;;
esac
[ "$node_major" -ge 18 ] || fail "Node.js 18 or newer is required"

if command -v curl >/dev/null 2>&1; then
	download_command=curl
elif command -v wget >/dev/null 2>&1; then
	download_command=wget
else
	fail "curl or wget is required to download $tarball_url"
fi

tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/prose-install.XXXXXX")
cleanup() {
	rm -rf "$tmpdir"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

archive_path="$tmpdir/$asset_name"
extract_dir="$tmpdir/extract"
contents_path="$tmpdir/contents.txt"
details_path="$tmpdir/contents.verbose.txt"
checksum_path="$tmpdir/checksum.txt"
mkdir -p "$extract_dir"

log "Downloading $tarball_url"
download_to "$tarball_url" "$archive_path"

if [ -n "${PROSE_SHA256:-}" ]; then
	expected_checksum=$PROSE_SHA256
elif [ "${PROSE_SKIP_SHA256:-0}" = "1" ]; then
	expected_checksum=
else
	log "Downloading checksum $sha256_url"
	download_to "$sha256_url" "$checksum_path" || fail "failed to download checksum. Set PROSE_SHA256 or PROSE_SKIP_SHA256=1 for private installs."
	checksum_line=$(sed -n '1p' "$checksum_path")
	expected_checksum=${checksum_line%% *}
fi

if [ -n "${expected_checksum:-}" ]; then
	safe_sha256 "$expected_checksum" "PROSE_SHA256"
	if command -v sha256sum >/dev/null 2>&1; then
		checksum_line=$(sha256sum "$archive_path")
	elif command -v shasum >/dev/null 2>&1; then
		checksum_line=$(shasum -a 256 "$archive_path")
	else
		fail "sha256sum or shasum is required to verify the archive"
	fi

	actual_checksum=${checksum_line%% *}
	[ "$actual_checksum" = "$expected_checksum" ] || fail "archive checksum mismatch"
fi

tar -tzf "$archive_path" > "$contents_path" || fail "downloaded archive is not a readable tar.gz"
tar -tzvf "$archive_path" > "$details_path" || fail "downloaded archive is not a readable tar.gz"
while IFS= read -r entry; do
	case "$entry" in
		""|/*|../*|*/../*|*/..)
			fail "archive contains an unsafe path: $entry"
			;;
	esac

	case "$entry" in
		"$package_name"|"$package_name"/*) ;;
		*) fail "archive root must be $package_name/" ;;
	esac
done < "$contents_path"

while IFS= read -r entry; do
	entry_mode=${entry%% *}
	case "$entry_mode" in
		l*|h*|b*|c*|p*|s*)
			fail "archive contains an unsafe symlink, hardlink, or special file"
			;;
	esac
done < "$details_path"

tar -xzf "$archive_path" -C "$extract_dir" || fail "failed to extract downloaded archive"
package_root="$extract_dir/$package_name"
[ -d "$package_root" ] || fail "archive root is not a directory"
unsafe_link=$(find "$package_root" -type l -print -quit)
[ -z "$unsafe_link" ] || fail "archive contains an unsafe symlink: ${unsafe_link#"$package_root/"}"
unsafe_hardlink=$(find "$package_root" -type f -links +1 -print -quit)
[ -z "$unsafe_hardlink" ] || fail "archive contains a hardlinked file: ${unsafe_hardlink#"$package_root/"}"
unsafe_special=$(find "$package_root" \( -type b -o -type c -o -type p -o -type s \) -print -quit)
[ -z "$unsafe_special" ] || fail "archive contains a special file: ${unsafe_special#"$package_root/"}"
[ -f "$package_root/dist/index.js" ] || fail "archive is missing dist/index.js"

mkdir -p "$install_root" "$bin_dir"
rm -rf "$target_dir.tmp"
mv "$package_root" "$target_dir.tmp"
rm -rf "$target_dir"
mv "$target_dir.tmp" "$target_dir"

entrypoint="$target_dir/dist/index.js"
entrypoint_quoted=$(shell_single_quote_body "$entrypoint")
shim_tmp="$bin_dir/.prose.$$"
cat > "$shim_tmp" <<EOF
#!/bin/sh
PROSE_ENTRYPOINT='$entrypoint_quoted'
exec node "\$PROSE_ENTRYPOINT" "\$@"
EOF
chmod 755 "$shim_tmp"
mv "$shim_tmp" "$shim_path"

log "Installed prose $prose_version to $target_dir"
log "Created shim at $shim_path"
case ":$PATH:" in
	*":$bin_dir:"*) ;;
	*) log "Add $bin_dir to PATH to run prose from any shell." ;;
esac
