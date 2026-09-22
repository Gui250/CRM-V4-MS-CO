import type { AppContext } from '../context.js'
import { conflict, forbidden, notFound } from '../lib/errors.js'
import * as sessionModel from '../models/session.js'
import * as userModel from '../models/user.js'

type Changes = { status?: userModel.User['status']; role?: userModel.User['role'] }

function assertAdmin(actor: userModel.User) {
  if (actor.role !== 'admin') throw forbidden()
}

export async function list(ctx: AppContext, actor: userModel.User, filter: { status?: userModel.User['status'] }) {
  assertAdmin(actor)
  return userModel.list(ctx.db, filter)
}

export async function update(ctx: AppContext, actor: userModel.User, id: string, changes: Changes) {
  assertAdmin(actor)
  const target = await userModel.findById(ctx.db, id)
  if (!target) throw notFound('Usuário não encontrado.')

  const losesAccess = changes.status !== undefined && changes.status !== 'active'
  if (losesAccess && target.id === actor.id) {
    throw conflict('CANNOT_DISABLE_SELF', 'Você não pode desativar a sua própria conta.')
  }

  const isActiveAdmin = target.role === 'admin' && target.status === 'active'
  const losesAdmin = losesAccess || (changes.role !== undefined && changes.role !== 'admin')
  if (isActiveAdmin && losesAdmin && (await userModel.countActiveAdmins(ctx.db)) <= 1) {
    throw conflict('LAST_ADMIN', 'É preciso manter pelo menos um administrador ativo.')
  }

  const updated = await userModel.update(ctx.db, id, changes)
  if (!updated) throw notFound('Usuário não encontrado.')
  if (losesAccess) await sessionModel.deleteAllForUser(ctx.db, id)
  return updated
}

/** Any logged-in user may pick a lead assignee, so this is not admin-only. */
export function listAssignable(ctx: AppContext) {
  return userModel.listActive(ctx.db)
}
