import { NextResponse } from 'next/server'
import { accountPatchBody, errorResponse, jsonBody, uuidParam } from '@/lib/http'
import { updateGoogleAccount } from '@/server/services/google-accounts'

/** Разбирает вход, зовёт сервис, сериализует ответ. Логики здесь нет — инвариант 2. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const { accountId } = await params

  try {
    const body = await jsonBody(request, accountPatchBody)
    return NextResponse.json(await updateGoogleAccount(uuidParam(accountId, 'аккаунта'), body))
  } catch (error) {
    return errorResponse(error)
  }
}
