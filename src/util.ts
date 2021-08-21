export function camelCase(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
}

// normaliseFieldObjectName modifies the field name that appears in the `asObject` representation
// to match the logic found in `protobuf/compiler/js/js_generator.cc`. See: https://goo.gl/tX1dPQ
export function normaliseFieldObjectName(name: string): string {
  switch (name) {
    case "abstract":
    case "boolean":
    case "break":
    case "byte":
    case "case":
    case "catch":
    case "char":
    case "class":
    case "const":
    case "continue":
    case "debugger":
    case "default":
    case "delete":
    case "do":
    case "double":
    case "else":
    case "enum":
    case "export":
    case "extends":
    case "false":
    case "final":
    case "finally":
    case "float":
    case "for":
    case "function":
    case "goto":
    case "if":
    case "implements":
    case "import":
    case "in":
    case "instanceof":
    case "int":
    case "interface":
    case "long":
    case "native":
    case "new":
    case "null":
    case "package":
    case "private":
    case "protected":
    case "public":
    case "return":
    case "short":
    case "static":
    case "super":
    case "switch":
    case "synchronized":
    case "this":
    case "throw":
    case "throws":
    case "transient":
    case "try":
    case "typeof":
    case "var":
    case "void":
    case "volatile":
    case "while":
    case "with":
      return `pb_${name}`;
  }
  return name;
}