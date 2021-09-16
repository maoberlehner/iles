import MagicString from 'magic-string'
import { parse } from '@vue/compiler-sfc'
import type { Debugger } from 'debug'
import type { ElementNode, TemplateChildNode } from '@vue/compiler-core'
import { pascalCase } from './utils'
import { parseImports } from './parse'
import type { ParsedImports } from './parse'

export const unresolvedIslandKey = '__viteIslandComponent'

export async function wrapIslandsInSFC (code: string, filename: string, debug: Debugger) {
  const { descriptor: { template, script, scriptSetup }, errors } = parse(code, { filename })
  if (errors.length > 0 || !template) return

  const s = new MagicString(code)

  const jsCode = scriptSetup?.loc?.source || script?.loc?.source
  const imports = jsCode ? await parseImports(jsCode) : {}
  if (filename.includes('post.vue')) console.log({ imports })

  visitSFCNode(template.ast, s, imports, debug)
  return { code: s.toString(), map: s.generateMap({ hires: true }) }
}

function visitSFCNode (node: ElementNode | TemplateChildNode, s: MagicString, imports: ParsedImports, debug: Debugger) {
  if ('props' in node && node.props.some(prop => prop.name.startsWith('client:'))) {
    const { tag, loc: { start, end } } = node

    const componentBinding = imports[tag] ? tag : `_resolveComponent("${tag}")`

    debug(`<${tag} ${node.props.map(prop => prop.loc.source).join(' ')}>`)

    // Replace opening tag.
    s.overwrite(start.offset + 1, start.offset + 1 + tag.length,
      `Island componentName="${pascalCase(tag)}" :${unresolvedIslandKey}='${componentBinding}'`)

    // Replace closing tag.
    if (!node.isSelfClosing)
      s.overwrite(end.offset - 1 - tag.length, end.offset - 1, 'Island')
  }
  if ('children' in node)
    node.children.forEach(node => visitSFCNode(node as any, s, imports, debug))
}
