import { Enum, File, Service, Message, Extension } from "./main";

/**
 * A Registry registers all enums and messages for all files a plugin works
 * with.
 */
export class Registry {
  private enumsByName: Map<string, Enum> = new Map<string, Enum>();
  private messagesByName: Map<string, Message> = new Map<string, Message>();
  private filesByName: Map<string, File> = new Map<string, File>();
  private servicesByName: Map<string, Service> = new Map<string, Service>();
  private extensionsByName: Map<string, Extension> = new Map<
    string,
    Extension
  >();

  registerFile(file: File) {
    if (this.filesByName.has(file.name)) {
      throw new Error(
        `Failed to register file ${file.name}: already registered.`
      );
    }
    this.filesByName.set(file.name, file);
  }

  /**
   * Register a service
   *
   * @param ref: name of the message that scopes the message, "" for top level message
   *   // TODO(fischor): this must be the full name in order to make resolutions
   * @param message: the message to register
   */
  registerService(service: Service) {
    if (this.servicesByName.has(service.fullName)) {
      throw new Error(
        `Failed to register service ${service.fullName}: already registered.`
      );
    }
    this.servicesByName.set(service.fullName, service);
  }

  /**
   * Register an enum
   *
   * @param ref: name of the message that scopes the enum, "" for top level enums
   * @param enumType: the enum to register
   */
  registerEnum(enumType: Enum) {
    if (this.enumsByName.has(enumType.fullName)) {
      throw new Error(
        `Failed to register enum ${enumType.fullName}: already registered.`
      );
    }
    this.enumsByName.set(enumType.fullName, enumType);
  }

  /**
   * Register a message
   */
  registerMessage(message: Message) {
    if (this.messagesByName.has(message.fullName)) {
      throw new Error(
        `Failed to register message ${message.fullName}: already registered.`
      );
    }
    this.messagesByName.set(message.fullName, message);
  }

  registerExtension(extension: Extension) {
    if (this.extensionsByName.has(extension.fullName)) {
      throw new Error(
        `Failed to register extension ${extension.fullName}: already registered.`
      );
    }
    this.extensionsByName.set(extension.fullName, extension);
  }

  fileByName(fullName: string): File | null {
    return this.filesByName.get(fullName) ?? null;
  }

  serviceByName(fullName: string): Service | null {
    return this.servicesByName.get(fullName) ?? null;
  }

  messageByName(fullName: string): Message | null {
    return this.messagesByName.get(fullName) ?? null;
  }

  enumByName(fullName: string): Enum | null {
    return this.enumsByName.get(fullName) ?? null;
  }

  extensionByName(fullName: string): Extension | null {
    return this.extensionsByName.get(fullName) ?? null;
  }

  filesByPackage(protoPackage: string): File[] {
    let files = [];
    for (let f of this.filesByName.values()) {
      if (f.packageName == protoPackage) {
        files.push(f);
      }
    }
    return files;
  }

  servicesByPackage(protoPackage: string): Service[] {
    let services = [];
    for (let s of this.servicesByName.values()) {
      if (s.parentFile.packageName == protoPackage) {
        services.push(s);
      }
    }
    return services;
  }

  // TODO: top-level-only
  messagesByPackage(protoPackage: string): Message[] {
    let messages = [];
    for (let m of this.messagesByName.values()) {
      if (m.parentFile.packageName == protoPackage) {
        messages.push(m);
      }
    }
    return messages;
  }

  // TODO: top-level-only
  enumsByPackage(protoPackage: string): Enum[] {
    let enums = [];
    for (let e of this.enumsByName.values()) {
      if (e.parentFile.packageName == protoPackage) {
        enums.push(e);
      }
    }
    return enums;
  }

  // TODO: top-level-only
  extensionsByPackage(protoPackage: string): Extension[] {
    let extensions = [];
    for (let e of this.extensionsByName.values()) {
      if (e.parentFile.packageName == protoPackage) {
        extensions.push(e);
      }
    }
    return extensions;
  }

  allFiles(): Iterable<File> {
    return this.filesByName.values();
  }

  allMessages(): Iterable<Message> {
    return this.messagesByName.values();
  }

  allEnums(): Iterable<Enum> {
    return this.enumsByName.values();
  }

  allExtensions(): Iterable<Extension> {
    return this.extensionsByName.values();
  }
}

/**
 * If the name starts with a '.' it is fully-qualified. Otherwise, C++ like
 * scoping rules are used to fund the type (i.e. first the nested types
 * within this message are search, then within the parent, on up to the root
 * of the namespace).
 *
 * @param msg: fully-qualified name of the message the searched enum if referenced from
 * @param name: name of the enum as referenced
 */
export function resolveEnumTypeName(
  reg: Registry,
  ref: string,
  enumType: string
) {
  if (enumType.charAt(0) == ".") {
    return reg.enumByName(enumType.slice(1));
  }
  throw new Error("resolve without dot notation not implemented yet");
}

export function resolveMessageTypeName(
  reg: Registry,
  ref: string,
  messageType: string
) {
  if (messageType.charAt(0) == ".") {
    return reg.messageByName(messageType.slice(1));
  }
  throw new Error("resolve without dot notation not implemented yet");
}

