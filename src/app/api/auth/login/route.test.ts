import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { POST } from './route.ts'

describe('вход', () => {
  it('тело не по форме уводит обратно на форму, а не роняет обработчик', async () => {
    const request = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"password":"тайна"}',
    })

    const response = await POST(request)

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/login?error=1')
  })
})
