import type { NextFunction, Response } from 'express'
import { accessFor, type AccessResult } from '../db.js'
import { parseCookies, SESSION_COOKIE, shareCookieName } from '../security/cookies.js'
import type { AuthenticatedRequest } from './security.js'

export type BoardAccessRequest = AuthenticatedRequest & { boardAccess?: AccessResult }

export function resolveBoardAccess(request: BoardAccessRequest, response: Response, next: NextFunction): void {
  const boardId = request.params.boardId
  const cookies = parseCookies(request)
  const access = accessFor(boardId, cookies[SESSION_COOKIE], cookies[shareCookieName(boardId)])
  if (!access) {
    response.status(403).json({ error: 'Accès refusé.' })
    return
  }
  request.boardAccess = access
  next()
}

export function requireBoardEditor(request: BoardAccessRequest, response: Response, next: NextFunction): void {
  if (!request.boardAccess || request.boardAccess.role === 'viewer') {
    response.status(403).json({ error: 'Accès en écriture requis.' })
    return
  }
  next()
}

export function requireBoardOwner(request: BoardAccessRequest, response: Response, next: NextFunction): void {
  if (!request.boardAccess || request.boardAccess.role !== 'owner') {
    response.status(403).json({ error: 'Accès propriétaire requis.' })
    return
  }
  next()
}
