'use client'

import { SourceForm } from '@/components/bi/source-form/source-form'
import { AdminOnly } from '@/components/bi/sources/admin-only'

export default function NewSourcePage() {
  return (
    <AdminOnly title="Nova fonte" description="Escolha o tipo, informe a conexão e confira a prévia antes de salvar.">
      <SourceForm />
    </AdminOnly>
  )
}
