export interface TemplateContact {
  name: string | null
  phone: string
}

const VARIABLE = /\{\{\s*([\w.]+)\s*\}\}/g

function valueOf(variable: string, contact: TemplateContact): string {
  const name = contact.name?.trim() || contact.phone
  switch (variable) {
    case 'contato.nome':
      return name
    case 'contato.primeiro_nome':
      return name.split(/\s+/)[0] ?? name
    case 'contato.telefone':
      return contact.phone
    default:
      return ''
  }
}

/** Replaces {{contato.*}} variables; unknown variables become empty strings (research §11). */
export const renderTemplate = (text: string, contact: TemplateContact) =>
  text.replace(VARIABLE, (_, variable: string) => valueOf(variable, contact))
