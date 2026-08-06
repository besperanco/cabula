import asyncio
import json

import db
import seed_data
import seed_glossary
import seed_scenarios
from nicegui.elements.upload_files import SmallFileUpload
from nicegui.testing import User

pytest_plugins = ['nicegui.testing.user_plugin']


async def test_loads_with_seeded_commands(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)
    await user.should_see('comando(s)', retries=50)
    print('PAGE LOADED WITH SEEDED DATA')


async def test_tab_shows_command_count(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)
    await user.should_see(f'Comandos ({db.count_commands()})', retries=50)
    print('TAB COUNT OK')


async def test_search_by_concept_not_command(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='search-input').type('reiniciar servico')
    await user.should_see('systemctl restart', retries=50)
    print('CONCEPT SEARCH OK (found systemctl restart via description)')


async def test_category_filter(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='filter-Kubernetes').click()
    await user.should_see('kubectl get pods', retries=50)
    await user.should_not_see('openstack server list', retries=10)
    print('CATEGORY FILTER OK')


def test_command_category_normalization_reuses_existing_casing() -> None:
    cmd_id1 = db.add_command('boundary-cat-teste-1', 'desc', 'Boundary')
    cmd_id2 = db.add_command('boundary-cat-teste-2', 'desc', 'boundary')
    try:
        assert db.get_command(cmd_id1)['category'] == 'Boundary'
        assert db.get_command(cmd_id2)['category'] == 'Boundary', (
            'categoria devia ter sido normalizada para a capitalizacao ja existente'
        )
        assert db.list_command_categories().count('Boundary') == 1, 'nao devia haver duas categorias "Boundary"'
        print('CATEGORY NORMALIZATION OK, "boundary" reused existing "Boundary"')
    finally:
        db.delete_command(cmd_id1)
        db.delete_command(cmd_id2)


async def test_new_command_category_becomes_a_filter(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    cmd_id = db.add_command('boundary-teste-filtro-unico', 'comando de teste com categoria nova', 'Boundary')
    try:
        user.find(marker='search-input').type('boundary-teste-filtro-unico')
        await user.should_see('boundary-teste-filtro-unico', retries=50)
        await user.should_see(marker='filter-Boundary', retries=50)
        print('DYNAMIC CATEGORY OK, new category appears as a filter button')
    finally:
        db.delete_command(cmd_id)


async def test_create_command_with_new_category_via_dialog(user: User) -> None:
    # regressao: o campo "categoria" chegou a ser um combobox onde escrever
    # um valor novo so "pegava" se se premisse Enter — clicar direto em
    # Guardar criava o comando com a categoria por omissao (Linux), em
    # silencio. Agora e um campo de texto a parte, sempre fiavel.
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='new-command').click()
    await user.should_see('Novo comando', retries=50)
    user.find(marker='dialog-command').type('boundary-authenticate-teste-unico')
    user.find(marker='dialog-description').type('comando de teste')
    user.find(marker='dialog-new-category').type('Boundary')
    user.find(marker='dialog-save').click()

    matches = db.search_commands('boundary-authenticate-teste-unico')
    assert len(matches) == 1, f'esperava 1 resultado, veio {len(matches)}'
    assert matches[0]['category'] == 'Boundary', f'categoria devia ser Boundary, veio {matches[0]["category"]}'
    print('NEW CATEGORY VIA DIALOG OK')

    db.delete_command(matches[0]['id'])


async def test_add_edit_delete_command(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='new-command').click()
    await user.should_see('Novo comando', retries=50)
    user.find(marker='dialog-command').type('teste-comando-unico-xyz')
    user.find(marker='dialog-description').type('descricao de teste')
    user.find(marker='dialog-save').click()

    user.find(marker='search-input').type('teste-comando-unico-xyz')
    await user.should_see('teste-comando-unico-xyz', retries=100)
    print('ADD OK, found in results after search')

    # marcador de apagar e por-id (varios cartoes partilham o icone) —
    # obtem o id real diretamente da bd para saber qual apagar
    matches = db.search_commands('teste-comando-unico-xyz')
    assert len(matches) == 1, f'esperava 1 resultado na bd, veio {len(matches)}'
    cmd_id = matches[0]['id']

    user.find(marker=f'cmd-delete-{cmd_id}').click()
    await user.should_see('Apagar', retries=50)
    user.find(marker='confirm-delete').click()

    # o dialogo fechado fica no harness de testes com o valor residual do
    # campo (limitacao conhecida do nicegui.testing), por isso confirma-se
    # o resultado real diretamente na bd em vez de should_not_see na UI
    for _ in range(100):
        if db.get_command(cmd_id) is None:
            break
        await asyncio.sleep(0.05)
    assert db.get_command(cmd_id) is None, 'comando ainda existe na bd apos apagar'
    print('DELETE OK')


async def test_duplicate_command(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='search-input').type('systemctl status')
    await user.should_see('systemctl status', retries=50)

    matches = db.search_commands('systemctl status')
    assert len(matches) == 1, f'esperava 1 resultado, veio {len(matches)}'
    cmd_id = matches[0]['id']

    user.find(marker=f'cmd-duplicate-{cmd_id}').click()
    await user.should_see('Duplicar comando', retries=50)
    user.find(marker='dialog-save').click()

    duplicates = db.search_commands('systemctl status')
    assert len(duplicates) == 2, f'esperava 2 comandos "systemctl status" apos duplicar, veio {len(duplicates)}'
    print('DUPLICATE COMMAND OK')

    # apaga o duplicado, mantendo so o original semeado
    new_one = max(duplicates, key=lambda c: c['id'])
    db.delete_command(new_one['id'])


async def test_open_in_wsl_button_present_and_does_not_crash(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='search-input').type('systemctl status')
    await user.should_see('systemctl status', retries=50)

    matches = db.search_commands('systemctl status')
    assert len(matches) == 1, f'esperava 1 resultado, veio {len(matches)}'
    cmd_id = matches[0]['id']

    user.find(marker=f'cmd-wsl-{cmd_id}').click()
    await asyncio.sleep(0.3)
    # no ambiente de testes nao ha wt.exe/wsl.exe -- confirma so que o
    # clique nao rebenta a app e que aparece alguma notificacao (sucesso ou
    # o aviso de "nao encontrado")
    assert user.notify.messages, 'esperava alguma notificacao ao clicar em Abrir no WSL'
    print('OPEN IN WSL BUTTON OK (no crash)')


async def test_rename_tag_merges(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    cmd_id = db.add_command('tag-teste-comando-unico', 'desc', 'Linux', 'tagtemporaria outratag')
    try:
        user.find(marker='manage-tags').click()
        await user.should_see('Gerir tags', retries=50)

        name_input = next(iter(user.find(marker='rename-tag-input-tagtemporaria').elements))
        name_input.value = 'outratag'
        user.find(marker='rename-tag-save-tagtemporaria').click()
        await asyncio.sleep(0.2)

        updated = db.get_command(cmd_id)
        assert updated['tags'] == 'outratag', f'tags deviam ter fundido em "outratag", veio "{updated["tags"]}"'
        print('RENAME/MERGE TAG OK')
    finally:
        db.delete_command(cmd_id)


async def test_scenarios_tab_lists_seeded_playbooks(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='tab-scenarios').click()
    await user.should_see('Diagnosticar um pod que não arranca', retries=50)
    print('SCENARIOS TAB OK, seeded playbook visible')


async def test_scenario_detail_shows_ordered_steps(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='tab-scenarios').click()
    await user.should_see('Diagnosticar um pod que não arranca', retries=50)

    scenarios = db.search_scenarios('pod que não arranca')
    assert len(scenarios) == 1, f'esperava 1 cenario, veio {len(scenarios)}'
    sc_id = scenarios[0]['id']

    user.find(marker=f'scenario-view-{sc_id}').click()
    await user.should_see('kubectl describe pod "meu-pod"', retries=50)
    print('SCENARIO DETAIL OK, steps shown in order')


async def test_new_scenario_category_becomes_a_filter(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    sc_id = db.add_scenario('cenario-teste-categoria-nova', 'descricao', 'Boundary')
    db.replace_steps(sc_id, [('echo "teste"', '')])
    try:
        user.find(marker='tab-scenarios').click()
        user.find(marker='scenario-search-input').type('cenario-teste-categoria-nova')
        await user.should_see('cenario-teste-categoria-nova', retries=50)
        await user.should_see(marker='scenario-filter-Boundary', retries=50)
        print('DYNAMIC SCENARIO CATEGORY OK, new category appears as a filter button')
    finally:
        db.delete_scenario(sc_id)


async def test_create_scenario_with_new_category_via_dialog(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='tab-scenarios').click()
    user.find(marker='new-scenario').click()
    await user.should_see('Novo cenário', retries=50)
    user.find(marker='scenario-title').type('cenario-boundary-teste-unico')
    user.find(marker='scenario-new-category').type('Boundary')
    user.find(marker='step-command-0').type('boundary authenticate')
    user.find(marker='scenario-save').click()

    matches = db.search_scenarios('cenario-boundary-teste-unico')
    assert len(matches) == 1, f'esperava 1 resultado, veio {len(matches)}'
    assert matches[0]['category'] == 'Boundary', f'categoria devia ser Boundary, veio {matches[0]["category"]}'
    print('NEW SCENARIO CATEGORY VIA DIALOG OK')

    db.delete_scenario(matches[0]['id'])


async def test_add_edit_delete_scenario(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='tab-scenarios').click()
    await user.should_see('Cenários', retries=50)

    user.find(marker='new-scenario').click()
    await user.should_see('Novo cenário', retries=50)
    user.find(marker='scenario-title').type('cenario-teste-unico-xyz')
    user.find(marker='step-command-0').type('echo "teste"')
    user.find(marker='scenario-save').click()

    user.find(marker='scenario-search-input').type('cenario-teste-unico-xyz')
    await user.should_see('cenario-teste-unico-xyz', retries=100)
    print('SCENARIO ADD OK, found in results after search')

    matches = db.search_scenarios('cenario-teste-unico-xyz')
    assert len(matches) == 1, f'esperava 1 resultado na bd, veio {len(matches)}'
    sc_id = matches[0]['id']

    user.find(marker=f'scenario-delete-{sc_id}').click()
    await user.should_see('Apagar', retries=50)
    user.find(marker='confirm-delete-scenario').click()

    for _ in range(100):
        if db.get_scenario(sc_id) is None:
            break
        await asyncio.sleep(0.05)
    assert db.get_scenario(sc_id) is None, 'cenario ainda existe na bd apos apagar'
    print('SCENARIO DELETE OK')


async def test_duplicate_scenario(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='tab-scenarios').click()
    await user.should_see('Disco cheio', retries=50)

    scenarios = db.search_scenarios('Disco cheio')
    assert len(scenarios) == 1, f'esperava 1 cenario, veio {len(scenarios)}'
    sc_id = scenarios[0]['id']

    user.find(marker=f'scenario-duplicate-{sc_id}').click()
    await user.should_see('Duplicar cenário', retries=50)
    user.find(marker='scenario-save').click()

    duplicates = db.search_scenarios('Disco cheio (cópia)')
    assert len(duplicates) == 1, f'esperava encontrar o cenario duplicado, veio {len(duplicates)}'
    print('DUPLICATE SCENARIO OK')

    db.delete_scenario(duplicates[0]['id'])


async def test_glossary_tab_lists_seeded_terms(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='tab-glossary').click()
    await user.should_see('Pod', retries=50)
    print('GLOSSARY TAB OK, seeded term visible')


async def test_glossary_search_by_definition(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='tab-glossary').click()
    await user.should_see('Glossário', retries=50)

    user.find(marker='glossary-search-input').type('tamanho pré-definido')
    await user.should_see('Flavor', retries=50)
    print('GLOSSARY SEARCH OK (found Flavor via its definition)')


async def test_favorite_command_appears_in_favorites_tab(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='search-input').type('systemctl restart')
    await user.should_see('systemctl restart', retries=50)

    matches = db.search_commands('systemctl restart')
    assert len(matches) == 1, f'esperava 1 resultado, veio {len(matches)}'
    cmd_id = matches[0]['id']

    user.find(marker=f'cmd-fav-{cmd_id}').click()
    await asyncio.sleep(0.2)
    assert db.get_command(cmd_id)['favorite'] == 1, 'comando nao ficou marcado como favorito na bd'

    # nota: should_see por texto genérico nao chega aqui — o harness de
    # testes ve texto de paineis inativos (mesmo painel "Comandos" continua
    # com o cartao no DOM), por isso confirma-se um marcador exclusivo do
    # separador Favoritos, que so existe se refresh_home() correu de facto
    user.find(marker='tab-favorites').click()
    await user.should_see(marker=f'home-command-{cmd_id}', retries=50)
    print('FAVORITES OK, favorited command shows up on the Favoritos tab')

    # limpa o favorito para nao afetar outros testes que corram depois
    db.toggle_command_favorite(cmd_id)


async def test_favorites_category_filter(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    all_commands = db.list_commands()
    linux_id = next(c['id'] for c in all_commands if c['command'] == 'systemctl restart')
    k8s_id = next(c['id'] for c in all_commands if c['command'] == 'kubectl get pods')
    db.toggle_command_favorite(linux_id)
    db.toggle_command_favorite(k8s_id)

    user.find(marker='tab-favorites').click()
    await user.should_see(marker=f'home-command-{linux_id}', retries=50)
    await user.should_see(marker=f'home-command-{k8s_id}', retries=50)

    user.find(marker='favorites-filter-Linux').click()
    await user.should_see(marker=f'home-command-{linux_id}', retries=50)
    await user.should_not_see(marker=f'home-command-{k8s_id}', retries=10)
    print('FAVORITES CATEGORY FILTER OK, only Linux favorite shown')

    # limpa os favoritos para nao afetar outros testes que corram depois
    db.toggle_command_favorite(linux_id)
    db.toggle_command_favorite(k8s_id)


async def test_copy_command_marks_it_recent(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='search-input').type('systemctl status')
    await user.should_see('systemctl status', retries=50)

    matches = db.search_commands('systemctl status')
    assert len(matches) == 1, f'esperava 1 resultado, veio {len(matches)}'
    cmd_id = matches[0]['id']

    user.find(marker=f'cmd-copy-{cmd_id}').click()
    await asyncio.sleep(0.2)

    recents = db.list_recent()
    assert any(kind == 'command' and item['id'] == cmd_id for kind, item in recents), (
        'comando copiado nao apareceu nos recentes na bd'
    )
    print('RECENTS OK, copied command tracked as recent')


async def test_export_downloads_json_backup(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='export-data').click()
    response = await user.download.next()
    assert response.status_code == 200
    data = response.json()
    assert data['commands'], 'backup nao contem comandos'
    assert data['scenarios'], 'backup nao contem cenarios'
    assert data['glossary'], 'backup nao contem termos do glossario'
    print('EXPORT OK, JSON backup contains commands/scenarios/glossary')


async def test_import_merges_data_from_json(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    payload = {
        "version": 1,
        "commands": [{
            "command": "echo-teste-import-xyz", "description": "comando de teste de importacao",
            "category": "Linux", "tags": "", "example": "", "notes": "", "favorite": False,
        }],
        "scenarios": [],
        "glossary": [],
    }
    content = json.dumps(payload).encode('utf-8')

    user.find(marker='import-data').click()
    await user.should_see('Importar dados', retries=50)

    upload_element = next(iter(user.find(marker='import-upload').elements))
    await upload_element.handle_uploads([
        SmallFileUpload(name='backup.json', content_type='application/json', _data=content)
    ])
    await asyncio.sleep(0.3)

    matches = db.search_commands('echo-teste-import-xyz')
    assert len(matches) == 1, f'esperava 1 comando importado, veio {len(matches)}'
    print('IMPORT OK, command from JSON added to db')

    # limpa para nao afetar outros testes que corram depois
    db.delete_command(matches[0]['id'])


async def test_import_replace_wipes_existing_data(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    assert db.count_commands() > 0, 'esperava comandos ja seedados antes do teste'

    payload = {
        "version": 1,
        "commands": [{
            "command": "unico-comando-pos-substituicao", "description": "unico comando depois de substituir",
            "category": "Linux", "tags": "", "example": "", "notes": "", "favorite": False,
        }],
        "scenarios": [],
        "glossary": [],
    }
    content = json.dumps(payload).encode('utf-8')

    user.find(marker='import-data').click()
    await user.should_see('Importar dados', retries=50)
    user.find(marker='import-replace').click()

    upload_element = next(iter(user.find(marker='import-upload').elements))
    await upload_element.handle_uploads([
        SmallFileUpload(name='backup.json', content_type='application/json', _data=content)
    ])
    await asyncio.sleep(0.3)

    assert db.count_commands() == 1, f'esperava 1 comando apos substituir, veio {db.count_commands()}'
    assert db.count_scenarios() == 0
    assert db.count_terms() == 0
    print('IMPORT REPLACE OK, old data wiped and only the imported command remains')

    # repõe os dados seedados (apagados pelo "substituir tudo" acima) para
    # nao afetar outros testes que corram depois — seed() so insere quando a
    # respetiva tabela esta vazia, por isso apaga-se primeiro o comando unico
    # importado neste teste
    db.delete_command(db.search_commands('unico-comando-pos-substituicao')[0]['id'])
    seed_data.seed()
    seed_scenarios.seed()
    seed_glossary.seed()


async def test_rename_command_category_merges(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    cmd_id = db.add_command('rename-cat-teste-unico', 'desc', 'CategoriaTemp')
    try:
        user.find(marker='manage-command-categories').click()
        await user.should_see('Gerir categorias', retries=50)

        name_input = next(iter(user.find(marker='rename-command-input-CategoriaTemp').elements))
        name_input.value = 'Linux'
        user.find(marker='rename-command-save-CategoriaTemp').click()
        await asyncio.sleep(0.2)

        assert db.get_command(cmd_id)['category'] == 'Linux', 'categoria devia ter sido fundida em Linux'
        assert 'CategoriaTemp' not in db.list_command_categories(), 'categoria antiga devia ter desaparecido'
        print('RENAME/MERGE CATEGORY OK')
    finally:
        db.delete_command(cmd_id)


async def test_scenario_copy_all_button_present(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='tab-scenarios').click()
    await user.should_see('Diagnosticar um pod que não arranca', retries=50)

    scenarios = db.search_scenarios('pod que não arranca')
    sc_id = scenarios[0]['id']
    user.find(marker=f'scenario-view-{sc_id}').click()
    await user.should_see(marker='scenario-copy-all', retries=50)
    print('SCENARIO COPY-ALL BUTTON OK')


async def test_scenario_step_command_is_editable(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    user.find(marker='tab-scenarios').click()
    await user.should_see('Diagnosticar um pod que não arranca', retries=50)

    scenarios = db.search_scenarios('pod que não arranca')
    sc_id = scenarios[0]['id']
    user.find(marker=f'scenario-view-{sc_id}').click()
    await user.should_see(marker='scenario-step-command-1', retries=50)

    step_input = next(iter(user.find(marker='scenario-step-command-1').elements))
    original_value = step_input.value
    step_input.value = 'kubectl get pods -n "producao"'
    assert step_input.value != original_value, 'o campo devia ser editavel'

    # editar no dialogo nao pode alterar o cenario guardado na bd
    full = db.get_scenario(sc_id)
    assert full['steps'][0]['command'] == original_value, 'editar no dialogo alterou o cenario guardado'

    user.find(marker='scenario-copy-all').click()
    print('SCENARIO STEP EDITABLE OK, edits stay local and do not persist to the saved scenario')


async def test_theme_toggle(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    toggle = next(iter(user.find(marker='theme-toggle').elements))
    assert toggle._props.get('icon') == 'dark_mode', 'esperava icone dark_mode por omissao (tema claro)'

    user.find(marker='theme-toggle').click()
    await asyncio.sleep(0.2)
    assert toggle._props.get('icon') == 'light_mode', 'icone nao mudou para light_mode apos o clique'
    print('THEME TOGGLE OK')
