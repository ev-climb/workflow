/** Сервис бросает только эти ошибки. HTTP-код выбирает route handler, а не сервис. */
export class ServiceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = new.target.name
  }
}

/** Запрошенной сущности нет или она заархивирована. */
export class NotFoundError extends ServiceError {}

/** Вход не проходит по смыслу: пустой заголовок, отрицательный лимит, чужая доска. */
export class InvalidInputError extends ServiceError {}

/** Состояние базы разошлось с ожидаемым: коллизия ранга, устаревший etag. */
export class ConflictError extends ServiceError {}

/** Пароль не подошёл или сессия негодная. */
export class UnauthorizedError extends ServiceError {}

/** Аккаунт Google требует повторной авторизации: доступ отозван или refresh-токен умер. */
export class ReauthRequiredError extends ServiceError {}
