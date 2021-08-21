import {
  CodeGeneratorRequest,
  CodeGeneratorResponse,
} from "google-protobuf/google/protobuf/compiler/plugin_pb";
import { Registry } from "./registry";
import { File, JSIdent, JSImportPath } from "./main";
import * as path from "path";

function defaultNpmImportFunc(
  filename: string,
  protoPackage: string
): JSImportPath {
  // if google protobuf
  let splits = protoPackage.split(".");
  if (splits.length > 2 && splits[0] == "google" && splits[1] == "protobuf") {
    return new JSImportPath(
      "google-protobuf",
      filename.replace(".proto", "_pb")
    );
  }
  return new JSImportPath("", filename.replace(".proto", "_pb"));
}

export class Options {
  constructor(
    private paramFunc: (name: string, value: string) => void = () => {},
    private jsImportFunc: (
      filename: string,
      protoPackage: string
    ) => JSImportPath = defaultNpmImportFunc
  ) {}

  /**
   * Read the CodeGeneratorRequest from stdin and run f.
   */
  run(f: (plugin: Plugin) => void) {
    this.onStdin((buf) => {
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
        // TODO(fischor): run paramFunc
        let params = parseParameterString(request.getParameter());

        // Run the user provided params function.
        for (let { key, value } of params) {
          this.paramFunc(key, value);
        }

        const plugin = new Plugin(request, this.jsImportFunc);

        let response: CodeGeneratorResponse;
        try {
          // TODO(fischor): do something with the params: request.getParameter();
          // Why not use put them on the plugin instead of using this param
          // function?
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

  private onStdin(f: (buffer: Buffer) => void) {
    const buffers: Buffer[] = [];
    let totalLength = 0;

    // @ts-ignore
    const stdin = process.stdin;
    stdin.on("readable", function () {
      let chunk;

      while ((chunk = stdin.read())) {
        if (!(chunk instanceof Buffer))
          throw new Error("Did not receive buffer");
        buffers.push(chunk);
        totalLength += chunk.length;
      }
    });

    stdin.on("end", function () {
      let buffer = Buffer.concat(buffers, totalLength);
      f(buffer);
    });
  }
}

export class Plugin {
  /**
   * The request from protoc read from stdin.
   */
  public request: CodeGeneratorRequest;

  /**
   * The set of files that to generate and everything the import. Files appear
   * in topological order, so each file appears before any file that imports it.
   */
  public filesToGenerate: File[];

  public registry: Registry;

  /**
   * set of protobuf langeauge features to generate.
   */
  public supportedFeatures: number;

  private generatedFiles: GeneratedFile[] = [];

  constructor(
    request: CodeGeneratorRequest,
    jsImportFunc: (filename: string, protoPackage: string) => JSImportPath
  ) {
    this.request = request;
    this.filesToGenerate = [];
    this.supportedFeatures = 0;

    this.registry = new Registry();
    for (let fileProto of request.getProtoFileList()) {
      let fileName = fileProto.getName();
      if (fileName == null) {
        throw new Error("Filename not set");
      }
      let generate = request.getFileToGenerateList().includes(fileName);
      let file = new File(fileProto, generate, jsImportFunc);
      file._register(this.registry);
      file._resolve(this.registry);
      if (generate) {
        this.filesToGenerate.push(file);
      }
    }
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
    this.addImport(this.jsImportPath);
    // If its in the same proto package, then no import alias would be
    // needed.
    let alias = underscoreImportAlias(this.jsImportPath, ident.importPath);
    return `${alias}.${ident.name}`;
  }

  private addImport(jsImportPath: JSImportPath): boolean {
    // Avoid duplicate imports. Check if a similar import
    // already exists.
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
      // Add the import statements to the output buffer.
      // TODO(fischor): it might be possible that there is a module and a non
      // module with the same "path". These actually need to generate two
      // different import aliases. It is not sufficient to do this at this
      // position, because the `import_alias` function is also used in `g.Q` and
      // thus it needs to be decided before the imports are added to the buffer.
      let stmts: string[] = [];
      for (let imp of this.imports) {
        let alias = underscoreImportAlias(this.jsImportPath, imp);
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

/**
 * Replaces `/`, `.`, `-`, `@` with underscores.
 *
 * Example:
 *  JsImportPath{npmModule: "google-protobuf", "google/protobuf/any_pb"}
 *  --> google_protobuf__google_protobuf_any_pb
 *
 *  JsImportPath{npmModule: "" or same as g, "trainai/cloud/datafactory/v1/datafactory_pb"}
 *  --> trainai_cloud_datafactory_v1_datafactory_pb
 */
function underscoreImportAlias(
  g: JSImportPath,
  jsImportPath: JSImportPath
): string {
  let npmModule = "";
  if (g.npmModule != jsImportPath.npmModule) {
    npmModule = jsImportPath.npmModule.replace(/[\/@\.-]/g, "_") + "__";
  }
  return npmModule + jsImportPath.path.replace(/[\/@\.-]/g, "_");
}

function resolveImport(g: JSImportPath, jsImportPath: JSImportPath): string {
  if (g.npmModule != jsImportPath.npmModule) {
    return path.join(jsImportPath.npmModule, jsImportPath.path);
  }
  // Return the relative path. Note this function is expected to not be
  // called with identical JSImportPaths.
  return path.relative(g.path, jsImportPath.path);
}

type Parameter = { key: string; value: string }[];

function parseParameterString(paramString: string | undefined): Parameter {
  let params: Parameter = [];
  if (paramString != undefined) {
    let paramPairs = paramString.split(",");
    for (let paramPair of paramPairs) {
      let split = paramPair.split("=", 2);
      if (split.length == 1) {
        // There was no "=" in that paramPair
        params.push({ key: split[0], value: "" });
      } else {
        params.push({ key: split[0], value: split[1] });
      }
    }
  }
  return params;
}
