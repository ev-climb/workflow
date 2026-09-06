import { prepareDatabase } from '../vitest.db.ts'

/**
 * Та же тестовая база, что у vitest, с той же защитой от промаха по рабочей. Данные
 * засеваются перед каждым сценарием, здесь только база и миграции.
 */
export default prepareDatabase
