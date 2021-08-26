import * as path from "path";
import {
  CodeGeneratorRequest,
  CodeGeneratorResponse,
} from "google-protobuf/google/protobuf/compiler/plugin_pb";
import { Registry } from "./registry";
import { File, JSIdent, JSImportPath } from "./main";

/**
 * Options for resolving a raw CodeGeneratorRequest to `protogen` classes.
 *
 * In the resolution process, the raw FileDescriptors, Descriptors,
 * ServiceDescriptors etc. that are contained in the CodeGeneratorRequest
 * provided by protoc are turned into their corresponding `protogen` classes
 * (`File`, `Message`, `Service`).
 *
 * Use `Options.run` to run a code generation function.
 */
export class Options {
  /**
   * Create options for the resolution process.
   *
   * @param jsImportFunc Defines how to derive `JSImportPath`s for the `File`
   * objects in the resolution process. This also influences the `JSIdent`
   * attributes that are part of the `Message`, `Enum` and `Service` classes as
   * their import paths are inherited from the `File` they are defined in.
   * Default to use `defaultJSImportFunc`.
   */
  constructor(
    private jsImportFunc: (
      filename: string,
      protoPackage: string
    ) => JSImportPath = defaultJSImportFunc
  ) {}

  /**
   * Start resolution process and run `f` with the `Plugin` containing the
   * resolved classes.
   *
   * run waits for protoc to write the CodeGeneratorRequest to stdin, resolves
   * the raw FileDescriptors, Descriptors, ServiceDescriptors etc. contained in
   * it to their corresponding `protogen` classes and creates a new `Plugin` with
   * the resolved classes.
   * `f` is then called with the `Plugin` as argument. Once `f` returns,
   * `Options` will collect the CodeGeneratorResponse from `Plugin` that contains
   * information of all `GeneratedFile`s that have been created on the plugin.
   * The response is written stdout for protoc to pick it up. protoc writes the
   * generated files to disk.
   *
   * @param f Function to run with the Plugin containing the resolved classes.
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

/**
 * An invocation of a protoc plugin.
 *
 * Provides access to the resolved `protogen` classes as parsed from the
 * CodeGeneratorRequest read from protoc and is used to create a
 * CodeGeneratorResponse that is returned back to protoc.
 * To add a new generated file to the response, use `Plugin.new_generated_file`.
 */
export class Plugin {
  /**
   * Parameter passed to the plugin using ``{plugin name}_opt=<key>=<value>`
   * or ``<plugin>_out=<key>=<value>`` command line flags.
   */
  public readonly parameter: Map<string, string>;

  /**
   * Set of files to code generation is request for. These are the files
   * explictly passed to protoc as command line arguments.
   */
  public readonly filesToGenerate: File[];

  /**
   * The registry that was used in the resolution process. Contains declarations
   * of all files present in the CodeGeneratorRequest.
   */
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
   * Create a new generated file.
   *
   * The generated file will be added to the output of the plugin.
   *
   * @param filename Filename of the generated file.
   * @param jsImportPath JavaScript import path of the new generated file. This
   * is used to decide wheter to print the fully qualified name or the simple
   * name for a Python identifier when using `GeneratedFile.P`.
   * See {@see GeneratedFile}.
   * @returns The new generated file.
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
 * An output buffer to write generated code to.
 *
 * A generated file is a buffer. New lines can be added to the output buffer by
 * calling `P`.
 *
 * Additionally, the generated file provides mechanism for handling JavaScript
 * imports.  Internally it maintains a list of `JSImportPath`s that are requested
 * to be imported. Use `print_imports` to mark the position in the output buffer
 * the imports will be printed at.
 *
 * To create a new instance of a generated file use `Plugin.new_generated_file`.
 * `Plugin.new_generated_file` requires a `filename` and a `js_import_path` as
 * parameter.  The `filename` is obviously the name of the file to be created.
 * The `js_import_path` is used for *import resolution*. It specifies the
 * JavaScript module the generated file is representing.
 *
 * When calling `qualified_js_ident` the generated files import path is compared
 * to the import path of the JavaScript identifier that is passed as an argument.
 * If they refer to different JavaScript modules, the `JSImportPath` of the
 * argument is added to the list of imports of the generated file.  Note that
 * also `P` calls `qualified_js_ident`, so the above also applies to `JSIdent`s
 * arguments passed to `P`.
 */
export class GeneratedFile {
  /* Name of the generated file. */
  filename: string;

  private buf: string[] = [];
  private importMark = -1;
  private imports: JSImportPath[] = [];
  private jsImportPath: JSImportPath;
  private beforeResponse: (content: string) => string = (c) => c;

  constructor(filename: string, jsImportPath: JSImportPath) {
    this.filename = filename;
    this.jsImportPath = jsImportPath;
  }

  /**
   * Add a function that is going to be applied to the content of the generated
   * file before it is written to the CodeGeneratorResponse.
   *
   * This is especially to run a code formatter like `prettier`:
   *
   * ```
   * import prettier from "prettier";
   *
   * function runPrettier(source: string): string {
   *   return prettier.format(source, {
   *     parser: "typescript",
   *     printWidth: 100,
   *     tabWidth: 4,
   *   });
   * }
   *
   * // more detailed code omitted for brevity
   * g.doBeforeResponse(runPrettier);
   * ```
   */
  doBeforeResponse(f: (content: string) => string) {
    this.beforeResponse = f;
  }

  /**
   * Add a new line to the output buffer.
   *
   * Add a new line to the output buffer containing a stringified version of
   * the passed arguments.  For arguments that are of class `JSIdent`
   * `qualified_js_ident` is called. This will add the import path to the
   * generated files import list and write the fully qualified name of the
   * Javascript identifier, if necessary.
   *
   * @param args Items that make up the content of the new line. All args are
   * printed on the same line. There is no whitespace added between the
   * individual args.
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
   * Obtain the qualified JavaScript identifier name with respect to the generated file.
   *
   * If `ident.import_path` and the `import_path` of the generated file refer
   * to different JavaScript modules, the `ident.import_path`` will be added to
   * the list of imports of the generated file and the fully qualified name of
   * `ident` will be returned. That is, a combination of an autogenerated import
   * alias from the JavaScript script module and the name of the identifier.
   * E.g: `google_protobuf__google_protobuf_timestamp_pb.Timestamp` with an
   * automatically added import statement of
   * `import * as google_protobuf__google_protobuf_timestamp_pb from "google-protobuf/google/protobuf/timestamp_pb";`
   *
   * If `ident.import_path` and the `import_path` of the generated file refer to
   * the same JavaScropt module, the `ident.name`` will be returned and nothing
   * will be added to the list of imports of the generated file.
   *
   * @param ident The identifier to obtain the qualified name for.
   * @returns The qualified identifier name.
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
   * Set the mark to print the imports in the output buffer.
   *
   * The current location in the output buffer will be used to print the imports
   * collected by `qualified_py_ident`. Only one location can be set. Consecutive
   * calls will overwrite previous calls.
   *
   * Example:
   * ```javascript
   * g.P("# My javascript file")
   * g.P()
   * g.print_imports()
   * g.P()
   * g.P("# more content following after time imports..")
   * ```
   */
  printImports() {
    this.importMark = this.buf.length;
  }

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

export function defaultJSImportFunc(
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
