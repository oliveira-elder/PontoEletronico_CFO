#!/usr/bin/env bash
# Corrige KeyError: 'id' do docker-compose 1.29 (Python) com Docker Engine 25+/29
# e redireciona /usr/bin/docker-compose para o plugin Compose V2.
#
# Uso (como root):
#   sudo ./scripts/fix-compose-v1-keyerror.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Execute como root: sudo $0" >&2
  exit 1
fi

PROJECT_PY="/usr/lib/python3/dist-packages/compose/project.py"
BACKUP="${PROJECT_PY}.bak-keyerror-id"

if [ -f "$PROJECT_PY" ]; then
  python3 - <<'PY'
from pathlib import Path

path = Path("/usr/lib/python3/dist-packages/compose/project.py")
text = path.read_text()

if "container_id = event.get('id') or actor.get('ID')" in text:
    print("Patch KeyError já aplicado em", path)
    raise SystemExit(0)

old = '''        def build_container_event(event):
            container_attrs = event['Actor']['Attributes']
            time = datetime.datetime.fromtimestamp(event['time'])
            time = time.replace(
                microsecond=microseconds_from_time_nano(event['timeNano'])
            )

            container = None
            try:
                container = Container.from_id(self.client, event['id'])
            except APIError:
                # Container may have been removed (e.g. if this is a destroy event)
                pass

            return {
                'time': time,
                'type': 'container',
                'action': event['status'],
                'id': event['Actor']['ID'],
                'service': container_attrs.get(LABEL_SERVICE),
                'attributes': {
                    k: v for k, v in container_attrs.items()
                    if not k.startswith('com.docker.compose.')
                },
                'container': container,
            }

        def yield_loop(service_names):
            for event in self.client.events(
                filters={'label': self.labels()},
                decode=True
            ):
                # TODO: support other event types
                if event.get('Type') != 'container':
                    continue

                try:
                    if event['Actor']['Attributes'][LABEL_SERVICE] not in service_names:
                        continue
                except KeyError:
                    continue
                yield build_container_event(event)'''

new = '''        def build_container_event(event):
            # Docker Engine 25+/29: alguns eventos nao trazem "id" no topo.
            actor = event.get('Actor') or {}
            container_attrs = actor.get('Attributes') or {}
            container_id = event.get('id') or actor.get('ID')
            if not container_id:
                return None

            time = datetime.datetime.fromtimestamp(event['time'])
            time = time.replace(
                microsecond=microseconds_from_time_nano(event.get('timeNano', event['time'] * 10**9))
            )

            container = None
            try:
                container = Container.from_id(self.client, container_id)
            except APIError:
                # Container may have been removed (e.g. if this is a destroy event)
                pass

            return {
                'time': time,
                'type': 'container',
                'action': event.get('status') or event.get('Action'),
                'id': container_id,
                'service': container_attrs.get(LABEL_SERVICE),
                'attributes': {
                    k: v for k, v in container_attrs.items()
                    if not k.startswith('com.docker.compose.')
                },
                'container': container,
            }

        def yield_loop(service_names):
            for event in self.client.events(
                filters={'label': self.labels()},
                decode=True
            ):
                # TODO: support other event types
                if event.get('Type') != 'container':
                    continue

                try:
                    if event['Actor']['Attributes'][LABEL_SERVICE] not in service_names:
                        continue
                except KeyError:
                    continue
                built = build_container_event(event)
                if built is not None:
                    yield built'''

if old not in text:
    raise SystemExit(
        "Não foi possível aplicar o patch: padrão não encontrado em "
        f"{path}. Versão do compose pode ser diferente."
    )

backup = Path("/usr/lib/python3/dist-packages/compose/project.py.bak-keyerror-id")
if not backup.exists():
    backup.write_text(text)
    print("Backup:", backup)

path.write_text(text.replace(old, new))
print("OK: patch KeyError:'id' aplicado em", path)
PY
else
  echo "Compose V1 Python não encontrado em $PROJECT_PY — ok se só usa Compose V2."
fi

# Wrapper: docker-compose -> docker compose (V2)
if [ -x /usr/bin/docker-compose ] && [ ! -f /usr/bin/docker-compose.v1-python ]; then
  # Só move se ainda for o script Python entry-point
  if head -1 /usr/bin/docker-compose | grep -q python; then
    mv /usr/bin/docker-compose /usr/bin/docker-compose.v1-python
    echo "Backup do Compose V1: /usr/bin/docker-compose.v1-python"
  fi
fi

cat >/usr/bin/docker-compose <<'EOF'
#!/usr/bin/env bash
# Wrapper: Compose V1 (Python 1.29) é incompatível com Docker Engine 29+
# (KeyError ContainerConfig / KeyError 'id' em logs -f).
# Redireciona para o plugin Compose V2.
if ! docker compose version >/dev/null 2>&1; then
  echo "Erro: plugin 'docker compose' (V2) não encontrado." >&2
  exit 1
fi
exec docker compose "$@"
EOF
chmod +x /usr/bin/docker-compose

echo
echo "docker-compose agora usa Compose V2:"
docker-compose version
echo
echo "Para ver logs sem o crash antigo:"
echo "  docker compose logs -f"
echo "  # ou: docker-compose logs -f"
