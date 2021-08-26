#!/usr/bin/env node
import * as protogen from "../../src";

// Plugin to test the JSImportPath paths.
//
// It simply prints all possible import statements.

let packageA = protogen.JSImportPath.npm("@package/hello-world");
let packageB = protogen.JSImportPath.npm("hallo-welt", "my/awesome/protos_pb");

new protogen.Options().run((gen: protogen.Plugin) => {
  for (let file of gen.filesToGenerate) {
    let g = gen.newGeneratedFile(
      "imports.txt",
      new protogen.JSImportPath("imports.txt", "")
    );

    // Trigger an import for each file.
    for (let dep of file.dependencies) {
      let jsIdent = firstJSIdent(dep);
      if (jsIdent != null) {
        g.qualifiedJSIdent(jsIdent);
      }
    }

    g.qualifiedJSIdent(packageA.ident("A"));
    g.qualifiedJSIdent(packageB.ident("B"));

    g.P("// Testing imports");
    g.P();
    g.printImports();
  }
});

function firstJSIdent(file: protogen.File): protogen.JSIdent | null {
  for (let message of file.messages) {
    return message.jsIdent;
  }
  for (let enumType of file.enums) {
    return enumType.jsIdent;
  }
  for (let service of file.services) {
    return service.jsIdent;
  }
  // A file that just contains extensions.
  return null;
}
