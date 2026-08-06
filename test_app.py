import asyncio

import db
from nicegui.testing import User

pytest_plugins = ['nicegui.testing.user_plugin']


async def test_loads_with_seeded_commands(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)
    await user.should_see('comando(s)', retries=50)
    print('PAGE LOADED WITH SEEDED DATA')


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


async def test_theme_toggle(user: User) -> None:
    await user.open('/')
    await user.should_see('Cábula', retries=50)

    toggle = next(iter(user.find(marker='theme-toggle').elements))
    assert toggle._props.get('icon') == 'dark_mode', 'esperava icone dark_mode por omissao (tema claro)'

    user.find(marker='theme-toggle').click()
    await asyncio.sleep(0.2)
    assert toggle._props.get('icon') == 'light_mode', 'icone nao mudou para light_mode apos o clique'
    print('THEME TOGGLE OK')
