/** Данные дымового прогона. Их же читает сценарий, поэтому лежат отдельно от засева. */

export const E2E_PORT = 3100
export const E2E_ORIGIN = `http://localhost:${E2E_PORT}`

// Пароль живёт только внутри прогона: сервер поднимается со своим хешем поверх .env.
export const PASSWORD = 'dymovoy-parol-e2e'

export const BOARD = 'Дымовая доска'
/** Второй слот занимает доска без единого списка — интерфейс обязан это пережить. */
export const EMPTY_BOARD = 'Пустая доска'

export const TODO = 'Сделать'
export const DOING = 'В работе'

export const TODO_CARDS = ['Разобрать почту', 'Собрать отчёт', 'Позвонить в банк']
export const DOING_CARDS = ['Написать письмо']
