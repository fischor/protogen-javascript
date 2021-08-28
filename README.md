# `protogen`

Package `protogen` makes writing `protoc` plugins easy.
Working with the raw protobuf descriptor messages can be cumbersome.
`protogen` resolves and links the dependencies and references between the raw Protobuf descriptors and turns them into their corresponding `protogen` classes that are easier to work with.
It also provides mechanisms that are espacially useful to generate JavaScript/TypeScript code like dealing with module imports.

# Installation

Package `protogen` is available via npm. To install run:

```
npm install @protogenjs/protogen
```

## API

Most classes in `protogen` are simply replacements of their corresponding Protobuf descriptors: `protogen.File` represents a FileDescriptor, `protogen.Message` a Descriptor, `protogen.Field` a FieldDescriptor and so on. They should be self explanatory. You can read their docstrings for more information about them.

The classes `protogen.Options`, `protogen.Plugin` and `protogen.GeneratedFile` make up a framework to generate files.
You can see these in action in the following example plugin:

```typescript
#!/usr/bin/env node
/** An example plugin. */

import * as protogen from "@protogenjs/protogen";

new protogen.Options().run((gen: protogen.Plugin) => {
  for (let file of gen.filesToGenerate) {
    let g = gen.newGeneratedFile(
      file.name.replace(".proto", ".ts"),
      file.jsImportPath
    );
    g.P("# Generated code ahead.");
    g.P();
    g.printImports();
    g.P();
    for (let message of file.messages) {
      g.P("export class ", message.jsIdent.name, "{");
      for (let field of message.fields) {
        // TODO: generate code for the field
      }
      g.P("}");
      g.P();
    }
    for (let service of file.services) {
      g.P("export class ", service.jsIdent.name, "Client {");
      g.P("constructor (private host: string) {}");
      for (let method of service.methods) {
        // prettier-ignore
        g.P(method.jsName, "(request: ", method.input.jsIdent, "): ", method.output.jsIdent, "{");
        // TODO: generate the method implementation
        g.P("}");
        g.P();
      }
      g.P("}");
      g.P();
    }
  }
});
```

# Misc

## What is a protoc plugin anyway?

`protoc`, the **Proto**buf **c**ompiler, is used to generate code derived from Protobuf definitions (`.proto` files).
Under the hood, `protoc`'s job is to read and parse the definitions into their *Descriptor* types (see [google/protobuf/descriptor.proto](https://github.com/protocolbuffers/protobuf/blob/4f49062a95f18a6c7e21ba17715a2b0a4608151a/src/google/protobuf/descriptor.proto)).
When `protoc` is run (with a plugin) it creates a CodeGeneratorRequest (see [google/protobuf/compiler/plugin.proto#L68](https://github.com/protocolbuffers/protobuf/blob/4f49062a95f18a6c7e21ba17715a2b0a4608151a/src/google/protobuf/compiler/plugin.proto#L68)) that contains the descriptors for the files to generate and everything they import and passes it to the plugin via `stdin`.

A *protoc plugin* is an executable. It reads the CodeGeneratorRequest from `stdin` and returns a CodeGeneratorResponse (see [google/protobuf/compiler/plugin.proto#L99](https://github.com/protocolbuffers/protobuf/blob/4f49062a95f18a6c7e21ba17715a2b0a4608151a/src/google/protobuf/compiler/plugin.proto#L99)) via `stdout`.
The plugin can use the descriptors from the CodeGeneratorRequest to create output files (in memory).
It returns these output files (consisting of name and content as string) in the CodeGeneratorResponse to `protoc`.

`protoc` then writes these files to disk.

## Run `protoc` with your plugin

Assume you have an executable plugin under `path/to/plugin/main.js`.
You can invoke it via:

```
protoc 
    --plugin=protoc-gen-myplugin=path/to/plugin/main.js \
    --plugin_out=./output_root \
    myproto.proto myproto2.proto
```

Caveats:
- you must use the `--plugin=protoc-gen-<plugin_name>` prefix, otherwise `protoc` fails with "plugin not executable"
- your plugin must be executable (`chmod +x path/to/plugin/main.js` and put a `#!/usr/bin/env node` at the top of the file)

# See also

- if you want to write protoc plugins with Python: [github.com/fischor/protogen-python](https://github.com/fischor/protogen-python)
- if you want to write protoc plugins with Golang: [google.golang.org/protobuf/compiler/protogen](https://google.golang.org/protobuf/compiler/protogen)

# Credits

This package is inspired by the [google.golang.org/protobuf/compiler/protogen Golang](https://pkg.go.dev/google.golang.org/protobuf@v1.27.1/compiler/protogen) package.

