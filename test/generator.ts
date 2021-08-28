#!/usr/bin/env node
import * as protogen from "../src";

new protogen.Options().run((gen: protogen.Plugin) => {
  for (let file of gen.filesToGenerate) {
    let g = gen.newGeneratedFile(
      file.name.replace(".proto", ".out"),
      new protogen.JSImportPath("", "")
    );

    g.P("# Generated code output.");
    g.P();

    g.P("dependencies:");
    for (let dep of file.dependencies) {
      g.P("- name: ", dep.name);
      g.P("  num_dependencies: ", dep.dependencies.length);
      g.P("  num_messages: ", collectMessages(dep).length);
      g.P("  num_enums: ", collectEnums(dep).length);
      g.P("  num_services: ", dep.services.length);
      g.P("  num_extensions: ", dep.extensions.length);
    }
    g.P();

    g.P("messages:");
    for (let message of file.messages) {
      generateMessage(g, message, 0);
    }
    g.P();

    g.P("enums:");
    for (let e of file.enums) {
      generateEnum(g, e, 0);
    }
    g.P();

    g.P("services:");
    for (let service of file.services) {
      generateService(g, service);
    }
    g.P();

    g.P("extensions:");
    for (let extension of file.extensions) {
      generateExtension(g, extension);
    }
  }
});

function generateMessage(
  g: protogen.GeneratedFile,
  message: protogen.Message,
  lvl: number
) {
  g.P(" ".repeat(lvl), "- name: ", message.fullName);

  g.P(" ".repeat(lvl), "  fields:");
  for (let field of message.fields) {
    g.P(" ".repeat(lvl + 2), "- name: ", field.fullName);
    if (field.message != null) {
      g.P(" ".repeat(lvl + 2), "  message: ", field.message.fullName);
    } else {
      g.P(" ".repeat(lvl + 2), "  message: None");
    }
    if (field.enumType != null) {
      g.P(" ".repeat(lvl + 2), "  enum: ", field.enumType.fullName);
    } else {
      g.P(" ".repeat(lvl + 2), "  enum: None");
    }
  }

  g.P(" ".repeat(lvl), "  messages:");
  for (let nestedMessage of message.messages) {
    generateMessage(g, nestedMessage, lvl + 2);
  }

  g.P(" ".repeat(lvl), "  enums:");
  for (let nestedEnum of message.enums) {
    generateEnum(g, nestedEnum, lvl + 2);
  }
}

function generateEnum(
  g: protogen.GeneratedFile,
  enumType: protogen.Enum,
  lvl: number
) {
  g.P(" ".repeat(lvl), "- name: ", enumType.fullName);
  g.P(" ".repeat(lvl), "  values: ", enumType.fullName);
  for (let value of enumType.values) {
    g.P(" ".repeat(lvl + 2), "- name: ", value.fullName);
  }
}

function generateService(g: protogen.GeneratedFile, service: protogen.Service) {
  g.P("- name: ", service.fullName);
  g.P("  methods:");
  for (let method of service.methods) {
    g.P("  - name: ", method.fullName);
    g.P("    input: ", method.input.fullName);
    g.P("    output: ", method.input.fullName);
    g.P("    client_streaming: ", method.clientStreaming);
    g.P("    server_streaming: ", method.serverStreaming);
    g.P("    path: ", method.grpcPath);
  }
}

function generateExtension(
  g: protogen.GeneratedFile,
  extension: protogen.Extension
) {
  g.P("- name: ", extension.fullName);
  g.P("  extendee: ", extension.extendee!.fullName);
  if (extension.message != null) {
    g.P("  message: ", extension.message.fullName);
  } else {
    g.P("  message: None");
  }
  if (extension.enumType != null) {
    g.P("  enum: ", extension.enumType.fullName);
  } else {
    g.P("  enum: None");
  }
}

function collectMessages(
  fm: protogen.File | protogen.Message
): protogen.Message[] {
  let messages: protogen.Message[] = [];
  for (let m of fm.messages) {
    messages.push(m);
    messages.push(...collectMessages(m));
  }
  return messages;
}

function collectEnums(fm: protogen.File | protogen.Message): protogen.Enum[] {
  let enums: protogen.Enum[] = [...fm.enums];
  for (let m of fm.messages) {
    enums.push(...collectEnums(m));
  }
  return enums;
}
