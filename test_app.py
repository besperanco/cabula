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
