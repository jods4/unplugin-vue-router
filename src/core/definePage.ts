import {
  getTransformResult,
  isCallOf,
  parseSFC,
  MagicString,
  checkInvalidScopeReference,
} from '@vue-macros/common'
import { Thenable, TransformResult } from 'unplugin'
import type {
  CallExpression,
  Node,
  ObjectProperty,
  Statement,
  StringLiteral,
} from '@babel/types'
import { walkAST } from 'ast-walker-scope'
import { CustomRouteBlock } from './customBlock'

const MACRO_DEFINE_PAGE = 'definePage'

function isStringLiteral(node: Node | null | undefined): node is StringLiteral {
  return node?.type === 'StringLiteral'
}

export function definePageTransform({
  code,
  id,
}: {
  code: string
  id: string
}): Thenable<TransformResult> {
  if (!code.includes(MACRO_DEFINE_PAGE)) return

  const sfc = parseSFC(code, id)

  if (!sfc.scriptSetup) return

  const { script, scriptSetup, scriptCompiled } = sfc

  const definePageNodes = (scriptCompiled.scriptSetupAst as Node[])
    .map((node) => {
      if (node.type === 'ExpressionStatement') node = node.expression
      return isCallOf(node, MACRO_DEFINE_PAGE) ? node : null
    })
    .filter((node): node is CallExpression => !!node)

  if (!definePageNodes.length) {
    return
  } else if (definePageNodes.length > 1) {
    throw new SyntaxError(`duplicate definePage() call`)
  }

  const definePageNode = definePageNodes[0]
  const setupOffset = scriptSetup.loc.start.offset

  // we only want the page info
  if (id.includes(MACRO_DEFINE_PAGE)) {
    const s = new MagicString(code)
    // remove everything except the page info

    const routeRecord = definePageNode.arguments[0]

    const scriptBindings = sfc.scriptCompiled.scriptSetupAst
      ? getIdentifiers(sfc.scriptCompiled.scriptSetupAst as any)
      : []

    checkInvalidScopeReference(routeRecord, MACRO_DEFINE_PAGE, scriptBindings)

    // NOTE: this doesn't seem to be any faster than using MagicString
    // return (
    //   'export default ' +
    //   code.slice(
    //     setupOffset + routeRecord.start!,
    //     setupOffset + routeRecord.end!
    //   )
    // )

    s.remove(setupOffset + routeRecord.end!, code.length)
    s.remove(0, setupOffset + routeRecord.start!)
    s.prepend(`export default `)

    return getTransformResult(s, id)
  } else {
    // console.log('!!!', definePageNode)

    const s = new MagicString(code)

    // s.removeNode(definePageNode, { offset: setupOffset })
    s.remove(
      setupOffset + definePageNode.start!,
      setupOffset + definePageNode.end!
    )

    return getTransformResult(s, id)
  }
}

export function extractDefinePageNameAndPath(
  sfcCode: string,
  id: string
): { name?: string; path?: string } | null | undefined {
  if (!sfcCode.includes(MACRO_DEFINE_PAGE)) return

  const sfc = parseSFC(sfcCode, id)

  if (!sfc.scriptSetup) return

  const { script, scriptSetup, scriptCompiled } = sfc

  const definePageNodes = (scriptCompiled.scriptSetupAst as Node[])
    .map((node) => {
      if (node.type === 'ExpressionStatement') node = node.expression
      return isCallOf(node, MACRO_DEFINE_PAGE) ? node : null
    })
    .filter((node): node is CallExpression => !!node)

  if (!definePageNodes.length) {
    return
  } else if (definePageNodes.length > 1) {
    throw new SyntaxError(`duplicate definePage() call`)
  }

  const definePageNode = definePageNodes[0]
  const setupOffset = scriptSetup.loc.start.offset

  const routeRecord = definePageNode.arguments[0]
  if (routeRecord.type !== 'ObjectExpression') {
    throw new SyntaxError(
      `[${id}]: definePage() expects an object expression as its only argument`
    )
  }

  const routeInfo: Pick<CustomRouteBlock, 'name' | 'path'> = {}

  for (const prop of routeRecord.properties) {
    if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
      if (prop.key.name === 'name') {
        if (prop.value.type !== 'StringLiteral') {
          console.warn(
            `[unplugin-vue-router]: route name must be a string literal. Found in "${id}".`
          )
        } else {
          routeInfo.name = prop.value.value
        }
      } else if (prop.key.name === 'path') {
        if (prop.value.type !== 'StringLiteral') {
          console.warn(
            `[unplugin-vue-router]: route path must be a string literal. Found in "${id}".`
          )
        } else {
          routeInfo.path = prop.value.value
        }
      }
    }
  }

  return routeInfo
}

function extractRouteAlias(
  aliasValue: ObjectProperty['value'],
  id: string
): string[] | undefined {
  if (
    aliasValue.type !== 'StringLiteral' &&
    aliasValue.type !== 'ArrayExpression'
  ) {
    console.warn(
      `[unplugin-vue-router]: route alias must be a string literal. Found in "${id}".`
    )
  } else {
    return aliasValue.type === 'StringLiteral'
      ? [aliasValue.value]
      : aliasValue.elements.filter(isStringLiteral).map((el) => el.value)
  }
}

const getIdentifiers = (stmts: Statement[]) => {
  let ids: string[] = []
  walkAST(
    {
      type: 'Program',
      body: stmts,
      directives: [],
      sourceType: 'module',
      sourceFile: '',
    },
    {
      enter(node) {
        if (node.type === 'BlockStatement') {
          this.skip()
        }
      },
      leave(node) {
        if (node.type !== 'Program') return
        ids = Object.keys(this.scope)
      },
    }
  )

  return ids
}
