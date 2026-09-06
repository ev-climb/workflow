import { NextResponse } from 'next/server'
import { errorResponse, jsonBody, uuidParam } from '@/lib/http'
import { accountPatchBody } from '@/lib/schemas'
import { removeGoogleAccount, updateGoogleAccount } from '@/server/services/google-accounts'

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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const { accountId } = await params

  try {
    return NextResponse.json(await removeGoogleAccount(uuidParam(accountId, 'аккаунта')))
  } catch (error) {
    return errorResponse(error)
  }
}
