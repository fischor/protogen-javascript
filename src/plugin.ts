import * as path from "path";
import {
  CodeGeneratorRequest,
  CodeGeneratorResponse,
} from "google-protobuf/google/protobuf/compiler/plugin_pb";
import { Registry } from "./registry";
import { File, JSIdent, JSImportPath } from "./main";

export class Options {
  constructor(
    private jsImportFunc: (
      filename: string,
      protoPackage: string
    ) => JSImportPath = defaultNpmImportFunc
  ) {}

  /**
   * Read the CodeGeneratorRequest from stdin and run f.
   */
  run(f: (plugin: Plugin) => void) {
    onStdin((buf) => {
      try {
        const arr = new Uint8Array(buf.length);
        arr.set(buf);

        const request = CodeGeneratorRequest.deserializeBinary(arr);
        if (request.getProtoFileList().length == 0) {
          throw new Error("no proto files provided");
        }
        if (request.getFileToGenerateList().length == 0) {
          throw new Error("no files to generate provided");
        }
        // Parse parameters. These are given as flags to protoc:
        //
        //   --plugin_opt=key1=value1
        //   --plugin_opt=key2=value2,key3=value3
        //   --plugin_opt=key4,,,
        //   --plugin_opt=key5:novalue5
        //   --plugin_out=key6:./path
        //
        // Multiple in one protoc call are possible. All `plugin_opt`s are joined
        // with a "," in the CodeGeneratorRequest. The equal sign actually has no
        // special meaning, its just a convention.
        //
        // The above would result in a parameter string of
        //
        //   "key1=value1,key2=value2,key3=value3,key4,,,,key5:novalue5,key6"
        //
        // (ignoring the order).
        //
        // Follow the convention of parameters pairs separated by commans in the
        // form {k}={v}. If {k} (without value), write an empty string to the
        // parameter dict. For {k}={v}={v2} write {k} as key and {v}={v2} as
        // value.
        let params: Map<string, string> = new Map();
        let paramString = request.getParameter();
        if (paramString) {
          for (let param of paramString.split(",")) {
            if (param == "") {
              // Ignore empty parameters.
              continue;
            }
            let split = param.split("=", 2);
            if (split.length == 1) {
              params.set(split[0], "");
            } else {
              params.set(split[0], split[1]);
            }
          }
        }

        // Resolve descriptors in CodeGeneratorRequest to their corresponding
        // protogen classes.
        let registry = new Registry();
        let filesToGenerate: File[] = [];
        for (let fileProto of request.getProtoFileList()) {
          let fileName = fileProto.getName();
          if (fileName == null) {
            throw new Error("Filename not set");
          }
          let generate = request.getFileToGenerateList().includes(fileName);
          let file = new File(fileProto, generate, this.jsImportFunc);
          file._register(registry);
          file._resolve(registry);
          if (generate) {
            filesToGenerate.push(file);
          }
        }

        const plugin = new Plugin(params, filesToGenerate, registry);

        let response: CodeGeneratorResponse;
        try {
          f(plugin);
          response = plugin.response();
        } catch (e) {
          // TODO(fischor): catching the error like below does not capture te
          // stacktrace. Hovever, this is a must for debugging.
          response = new CodeGeneratorResponse();
          response.setError(
            `Plugin exited with error: "${e.message}"\n${e.stack}`
          );
        }

        // @ts-ignore
        process.stdout.write(Buffer.from(response.serializeBinary()));
      } catch (err) {
        console.error("protoc plugin error: " + err.stack + "\n");
        // @ts-ignore
        process.exit(1);
      }
    });
  }
}

function onStdin(f: (buffer: Buffer) => void) {
  const buffers: Buffer[] = [];
  let totalLength = 0;

  // @ts-ignore
  const stdin = process.stdin;
  stdin.on("readable", function () {
    let chunk;

    while ((chunk = stdin.read())) {
      if (!(chunk instanceof Buffer)) throw new Error("Did not receive buffer");
      buffers.push(chunk);
      totalLength += chunk.length;
    }
  });

  stdin.on("end", function () {
    let buffer = Buffer.concat(buffers, totalLength);
    f(buffer);
  });
}

function readStdin(): Promise<Buffer> {
  return new Promise((resolve, _) => {
    onStdin((buf) => resolve(buf));
  });
}

export class Plugin {
  public readonly parameter: Map<string, string>;

  /**
   * The set of files that to generate and everything the import. Files appear
   * in topological order, so each file appears before any file that imports it.
   */
  public readonly filesToGenerate: File[];

  public readonly registry: Registry;

  private generatedFiles: GeneratedFile[] = [];

  constructor(
    parameter: Map<string, string>,
    filesToGenerate: File[],
    registry: Registry
  ) {
    this.parameter = parameter;
    this.filesToGenerate = filesToGenerate;
    this.registry = registry;
  }

  /**
   * Creates a new generated file with the given filename.
   *
   * When using g.P or g.qualifiedJSIdent:
   * For matching jsImportPaths, there is no import required.
   * For matching jsImportPath.npmModule, a relative import is done.
   * Otherwise, a full import is done.
   */
  newGeneratedFile(
    filename: string,
    jsImportPath: JSImportPath
  ): GeneratedFile {
    let g = new GeneratedFile(filename, jsImportPath);
    this.generatedFiles.push(g);
    return g;
  }

  response(): CodeGeneratorResponse {
    let resp = new CodeGeneratorResponse();
    for (let g of this.generatedFiles) {
      resp.addFile(g.proto());
    }
    return resp;
  }
}

/**
 * Represents a CodeGeneratorRequest.File.
 */
export class GeneratedFile {
  private buf: string[] = [];

  private importMark = -1;

  /**  List of imports. Guarded by addImports. */
  private imports: JSImportPath[] = [];

  private jsImportPath: JSImportPath;

  private beforeResponse: (content: string) => string = (c) => c;

  /**
   * @param filename: full filepath, used to generate import from.
   */
  constructor(public filename: string, jsImportPath: JSImportPath) {
    this.jsImportPath = jsImportPath;
  }

  doBeforeResponse(f: (content: string) => string) {
    this.beforeResponse = f;
  }

  /**
   * Print a message as a new line to the buffer.
   */
  P(...args: any[]) {
    let line = "";
    for (let arg of args) {
      if (arg instanceof JSIdent) {
        let q = this.qualifiedJSIdent(arg);
        line += q;
      } else {
        line += String(arg);
      }
    }
    this.buf.push(line);
  }

  /**
   * Qualified ident. Returns the fully qualified identifier as string. The
   * import path will be added to the list of imports and included in the
   * imports statements that are added with `printImports`.
   */
  qualifiedJSIdent(ident: JSIdent): string {
    // Note that import path for generated proto message is the proto file
    // with `.proto` replaced by `_pb.ts`.
    if (this.jsImportPath.equals(ident.importPath)) {
      return ident.name;
    }
    this.addImport(ident.importPath);
    let alias = aliasImportPath(this.jsImportPath, ident.importPath);
    return `${alias}.${ident.name}`;
  }

  private addImport(jsImportPath: JSImportPath): boolean {
    // Avoid duplicate imports. Check if a equivalent import already exists.
    for (let imp of this.imports) {
      if (imp.equals(jsImportPath)) {
        return false;
      }
    }
    this.imports.push(jsImportPath);
    return true;
  }

  /**
   * Set the location of the imports in the output buffer.
   *
   * Imports are not yet added to the buffer directly, because one might need
   * to add some imports later on in the code. The imports are actually added
   * to the output right before creating the response.
   */
  printImports() {
    this.importMark = this.buf.length;
  }

  /**
   * Generates the `CodeGeneratorResponse` of the plugin as proto.
   */
  proto(): CodeGeneratorResponse.File {
    let buf = this.buf;

    if (this.importMark > -1) {
      let stmts: string[] = [];
      for (let imp of this.imports) {
        let alias = aliasImportPath(this.jsImportPath, imp);
        let path = resolveImport(this.jsImportPath, imp);
        stmts.push(`import * as ${alias} from "${path}";`);
      }
      let before = buf.slice(0, this.importMark);
      let after = buf.slice(this.importMark);
      buf = before.concat(stmts, after);
    }

    let content = buf.join("\n");
    content = this.beforeResponse(content);

    const f = new CodeGeneratorResponse.File();
    f.setName(this.filename);
    f.setContent(content);
    return f;
  }
}

export function defaultNpmImportFunc(
  filename: string,
  protoPackage: string
): JSImportPath {
  // if google protobuf
  let splits = protoPackage.split(".");
  if (splits.length > 2 && splits[0] == "google" && splits[1] == "protobuf") {
    return new JSImportPath(
      filename.replace(".proto", "_pb"),
      "google-protobuf",
      filename.replace(".proto", "_pb")
    );
  }
  // Else, assume no npm module
  return new JSImportPath(filename.replace(".proto", "_pb"), "");
}

// TODO: there are still clashes possible (but unlikely). E.g. the modules
// "@package/hello" and "package-hello" would get the same alias.
function aliasImportPath(g: JSImportPath, jsImportPath: JSImportPath): string {
  // - Replace `/`, `.`, `-`, `@` with underscores.
  // - For imports from npm modules: separate <npmModule>__<pathUnderModule>
  // - For relative imports: _<path>
  if (g.npmModule != jsImportPath.npmModule) {
    let modulePart = jsImportPath.npmModule
      .replace(/[\/\.-]/g, "_")
      .replace(/@/g, "");
    if (jsImportPath.npmPathUnderModule == "") {
      return modulePart;
    }
    return (
      modulePart +
      "__" +
      jsImportPath.npmPathUnderModule.replace(/[\/@\.-]/g, "_")
    );
  }
  return "_" + jsImportPath.path.replace(/[\/@\.-]/g, "_");
}

function resolveImport(g: JSImportPath, jsImportPath: JSImportPath): string {
  if (g.npmModule != jsImportPath.npmModule) {
    return path.join(jsImportPath.npmModule, jsImportPath.npmPathUnderModule);
  }
  // Note that path.relative(from, to) always expecting a directory as "from".
  let from = path.dirname(g.path);
  let relPath = path.relative(from, "./" + jsImportPath.path);
  // Relative path might look like "google/protobuf/annotations_pb".
  // Ensure they leading "./".
  if (!relPath.startsWith(".")) {
    relPath = "./" + relPath;
  }
  return relPath;
}
