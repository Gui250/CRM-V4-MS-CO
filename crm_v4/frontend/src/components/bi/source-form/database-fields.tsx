import { Field } from '@/components/ui/input'
import { Checkbox, SelectField, TextAreaField } from './controls'
import type { KindFieldsProps } from './spreadsheet-fields'

export const READ_ONLY_HINT = 'Somente SELECT; use um usuário com permissão só de leitura.'

export function DatabaseFields({ draft, onChange, errors }: KindFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Endereço (host)" value={draft.host} error={errors.host} onChange={(e) => onChange({ host: e.target.value })} />
      <Field label="Porta" type="number" min={1} value={draft.port} error={errors.port} onChange={(e) => onChange({ port: e.target.value })} />
      <Field label="Banco" value={draft.database} error={errors.database} onChange={(e) => onChange({ database: e.target.value })} />
      <Field label="Usuário" autoComplete="off" value={draft.user} error={errors.user} onChange={(e) => onChange({ user: e.target.value })} />
      <Field
        label="Senha"
        type="password"
        autoComplete="new-password"
        placeholder={draft.maskedPassword ? `${draft.maskedPassword} — deixe em branco para manter` : undefined}
        value={draft.password}
        error={errors.password}
        onChange={(e) => onChange({ password: e.target.value })}
      />
      <div className="flex items-end pb-2">
        <Checkbox label="Usar SSL" checked={draft.ssl} onChange={(ssl) => onChange({ ssl })} />
      </div>
      <SelectField
        label="O que ler"
        className="sm:col-span-2"
        value={draft.mode}
        hint={draft.mode === 'table' ? READ_ONLY_HINT : undefined}
        options={[
          { value: 'table', label: 'Uma tabela' },
          { value: 'query', label: 'Uma consulta SQL' },
        ]}
        onChange={(e) => onChange({ mode: e.target.value === 'query' ? 'query' : 'table' })}
      />
      {draft.mode === 'table' ? (
        <>
          <Field label="Schema" hint="Opcional." value={draft.schema} onChange={(e) => onChange({ schema: e.target.value })} />
          <Field label="Tabela" value={draft.table} error={errors.table} onChange={(e) => onChange({ table: e.target.value })} />
        </>
      ) : (
        <TextAreaField
          label="Consulta"
          className="sm:col-span-2"
          placeholder="SELECT …"
          hint={READ_ONLY_HINT}
          value={draft.query}
          error={errors.query}
          onChange={(e) => onChange({ query: e.target.value })}
        />
      )}
    </div>
  )
}
