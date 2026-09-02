import { expect, test, type Locator, type Page } from '@playwright/test'
import { DOING, DOING_CARDS, PASSWORD, TODO, TODO_CARDS } from './fixture.ts'
import { seed } from './seed.ts'

test.beforeEach(seed)

/**
 * Первая отрисовка приходит с сервера, следом клиент перечитывает доски. Ждём этого
 * до жеста, чтобы перерисовка не пришлась на середину перетаскивания.
 */
async function opened(page: Page, go: () => Promise<unknown>) {
  const board = page.waitForResponse(
    (r) => r.request().method() === 'GET' && r.url().includes('/api/boards/'),
  )
  await go()
  await board
  await expect(page.locator('section[data-slot="top"]')).toBeVisible()
}

async function signIn(page: Page) {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await page.getByPlaceholder('Пароль').fill(PASSWORD)
  await opened(page, () => page.getByRole('button', { name: 'Войти' }).click())
}

/** Список верхнего слота по названию. */
function column(page: Page, title: string): Locator {
  return page
    .locator('section[data-slot="top"] section')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
}

const cards = (page: Page, list: string) => column(page, list).locator('article')

const cardTitle = (card: Locator) => card.locator('p').first().innerText()

/**
 * Порог сенсора — 5 пикселей, и промежуточные шаги обязательны: одним прыжком мыши
 * dnd-kit жест за перетаскивание не считает.
 */
async function drag(page: Page, from: Locator, to: Locator) {
  const source = await from.boundingBox()
  const target = await to.boundingBox()
  if (!source || !target) throw new Error('перетаскивать нечего: элемента нет на экране')

  const x = source.x + source.width / 2
  const y = source.y + source.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 12, y + 12, { steps: 5 })
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 })
  await page.mouse.up()
}

/**
 * dnd-kit объявляет вслух, что подняло карточку и выбрало цель. До этого мерки целей
 * не сняты, и стрелка, нажатая раньше, уходит вхолостую.
 */
const grabbed = (page: Page) =>
  expect(page.locator('[id^="DndLiveRegion"]')).toContainText('moved over')

/**
 * Карточка встаёт на место мгновенно, а запрос уходит следом: без ожидания ответа
 * перезагрузка обрывает его навигацией, и проверка «пережило F5» ничего не проверяет.
 */
async function saved(page: Page, move: () => Promise<void>, path = '/api/cards/') {
  const response = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().includes(path),
  )
  await move()
  expect((await response).ok()).toBe(true)
}

test('войти, перетащить карточку мышью в соседний список, найти её там после перезагрузки', async ({
  page,
}) => {
  await signIn(page)

  const moved = TODO_CARDS[0]
  await expect(cards(page, TODO)).toHaveCount(TODO_CARDS.length)
  await expect(cards(page, DOING)).toHaveCount(DOING_CARDS.length)

  await saved(page, () =>
    drag(page, cards(page, TODO).filter({ hasText: moved }), cards(page, DOING).first()),
  )

  await expect(cards(page, TODO)).toHaveCount(TODO_CARDS.length - 1)
  await expect(cards(page, DOING)).toHaveCount(DOING_CARDS.length + 1)
  await expect(cards(page, DOING).filter({ hasText: moved })).toHaveCount(1)

  await opened(page, () => page.reload())

  await expect(cards(page, DOING).filter({ hasText: moved })).toHaveCount(1)
  await expect(cards(page, TODO).filter({ hasText: moved })).toHaveCount(0)
})

test('переставить карточку с клавиатуры', async ({ page }) => {
  await signIn(page)

  const todo = cards(page, TODO)
  const first = await cardTitle(todo.nth(0))
  const second = await cardTitle(todo.nth(1))

  await saved(page, async () => {
    const card = todo.nth(0)
    await card.focus()
    await page.keyboard.press('Space')
    // подъём доходит до dnd-kit не мгновенно, а до него стрелка уходит вхолостую
    await expect(card).toHaveAttribute('aria-pressed', 'true')
    await grabbed(page)
    await page.keyboard.press('ArrowDown')
    // сосед отъехал — значит новая цель дошла до dnd-kit, и отпускать уже не рано
    await expect(todo.nth(1)).not.toHaveCSS('transform', 'none')
    await page.keyboard.press('Space')
  })

  await expect(todo.nth(0)).toContainText(second)
  await expect(todo.nth(1)).toContainText(first)

  await opened(page, () => page.reload())

  await expect(todo.nth(0)).toContainText(second)
  await expect(todo.nth(1)).toContainText(first)
})

/** Названия списков верхнего слота слева направо. */
const columnTitles = (page: Page) =>
  page.locator('section[data-slot="top"] section h3').allInnerTexts()

test('переставить список мышью и найти его на новом месте после перезагрузки', async ({
  page,
}) => {
  await signIn(page)

  expect(await columnTitles(page)).toEqual([TODO, DOING])

  await saved(
    page,
    () => drag(page, column(page, TODO).locator('header'), column(page, DOING).locator('header')),
    '/api/lists/',
  )

  expect(await columnTitles(page)).toEqual([DOING, TODO])

  await opened(page, () => page.reload())

  expect(await columnTitles(page)).toEqual([DOING, TODO])
})

/** Сегодняшняя дата по-московски: на ней открывается сетка, ею же подписана шапка дня. */
const moscowToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date())

/** Сроки карточек на сетке: ссылка на карточку и есть полоса срока. */
const dueStripes = (page: Page) => page.locator('aside a[href^="/?card="]')

test('перетащить карточку на календарь и найти её срок на сетке после перезагрузки', async ({
  page,
}) => {
  await signIn(page)

  const dated = TODO_CARDS[0]
  await expect(dueStripes(page)).toHaveCount(0)

  await saved(page, () =>
    drag(
      page,
      cards(page, TODO).filter({ hasText: dated }),
      page.locator(`[data-day-head="${moscowToday()}"]`),
    ),
  )

  await expect(dueStripes(page)).toHaveCount(1)
  await expect(dueStripes(page)).toContainText(dated)

  await opened(page, () => page.reload())

  await expect(dueStripes(page)).toContainText(dated)
})
