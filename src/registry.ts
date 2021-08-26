import { Enum, File, Service, Message, Extension } from "./descriptor";

/**
 * A registry for protogen types.
 *
 * A registry holds referneces to `File`, :`Service`, `Enum`, `Message` and
 * `Extension` objects that have been resolved within a resolution process (see
 * {@see Options.run}.
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

  _registerFile(file: File) {
    if (this.filesByName.has(file.name)) {
      throw new Error(
        `Failed to register file ${file.name}: already registered.`
      );
    }
    this.filesByName.set(file.name, file);
  }

  _registerService(service: Service) {
    if (this.servicesByName.has(service.fullName)) {
      throw new Error(
        `Failed to register service ${service.fullName}: already registered.`
      );
    }
    this.servicesByName.set(service.fullName, service);
  }

  _registerEnum(enumType: Enum) {
    if (this.enumsByName.has(enumType.fullName)) {
      throw new Error(
        `Failed to register enum ${enumType.fullName}: already registered.`
      );
    }
    this.enumsByName.set(enumType.fullName, enumType);
  }

  _registerMessage(message: Message) {
    if (this.messagesByName.has(message.fullName)) {
      throw new Error(
        `Failed to register message ${message.fullName}: already registered.`
      );
    }
    this.messagesByName.set(message.fullName, message);
  }

  _registerExtension(extension: Extension) {
    if (this.extensionsByName.has(extension.fullName)) {
      throw new Error(
        `Failed to register extension ${extension.fullName}: already registered.`
      );
    }
    this.extensionsByName.set(extension.fullName, extension);
  }

  /**
   * Get a file by its full name.
   *
   * @param fullName The full (proto) name of the file to retrieve.
   * @returns The file or `null` if no file with that name has been registered.
   */
  fileByName(fullName: string): File | null {
    return this.filesByName.get(fullName) ?? null;
  }

  /**
   * Get a service by its full name.
   *
   * @param fullName The full (proto) name of the service to retrieve.
   * @returns The service or `null` if no service with that name has been
   * registered.
   */
  serviceByName(fullName: string): Service | null {
    return this.servicesByName.get(fullName) ?? null;
  }

  /**
   * Get a message by its full name.
   *
   * @param fullName The full (proto) name of the message to retrieve.
   * @returns The message or `null` if no message with that name has been
   * registered.
   */
  messageByName(fullName: string): Message | null {
    return this.messagesByName.get(fullName) ?? null;
  }

  /**
   * Get an enum by its full name.
   *
   * @param fullName The full (proto) name of the enum to retrieve.
   * @returns The enum or `null` if no enum with that name has been registered.
   */
  enumByName(fullName: string): Enum | null {
    return this.enumsByName.get(fullName) ?? null;
  }

  /**
   * Get an extension by its full name.
   *
   * @param fullName The full (proto) name of the extension to retrieve.
   * @returns The extension or `null` if no extension with that name has been
   * registered.
   */
  extensionByName(fullName: string): Extension | null {
    return this.extensionsByName.get(fullName) ?? null;
  }

  /**
   * Get files by proto package.
   *
   * @param protoPackage The proto package to get files for.
   * @returns The files.
   */
  filesByPackage(protoPackage: string): File[] {
    let files = [];
    for (let f of this.filesByName.values()) {
      if (f.packageName == protoPackage) {
        files.push(f);
      }
    }
    return files;
  }

  /**
   * Get services by proto package.
   *
   * @param protoPackage The proto package to get services for.
   * @returns The services.
   */
  servicesByPackage(protoPackage: string): Service[] {
    let services = [];
    for (let s of this.servicesByName.values()) {
      if (s.parentFile.packageName == protoPackage) {
        services.push(s);
      }
    }
    return services;
  }

  /**
   * Get messages by proto package.
   *
   * @param protoPackage The proto package to get messages for.
   * @param topLevelOnly If `true`, only top-level messages are returned.
   * Otherwise nested messages are included.
   * @returns The messages.
   */
  messagesByPackage(
    protoPackage: string,
    topLevelOnly: boolean = false
  ): Message[] {
    let messages = [];
    for (let m of this.messagesByName.values()) {
      let include = m.parent == null || !topLevelOnly;
      if (m.parentFile.packageName == protoPackage && include) {
        messages.push(m);
      }
    }
    return messages;
  }

  /**
   * Get enums by proto package.
   *
   * @param protoPackage The proto package to get enums for.
   * @param topLevelOnly If `true`, only top-level enums are returned. Otherwise
   * nested enums are included.
   * @returns The enums.
   */
  enumsByPackage(protoPackage: string, topLevelOnly: boolean = false): Enum[] {
    let enums = [];
    for (let e of this.enumsByName.values()) {
      let include = e.parent == null || !topLevelOnly;
      if (e.parentFile.packageName == protoPackage && include) {
        enums.push(e);
      }
    }
    return enums;
  }

  /**
   * Get extensions by proto package.
   *
   * @param protoPackage The proto package to get extensions for.
   * @returns The extensions.
   */
  extensionsByPackage(protoPackage: string): Extension[] {
    let extensions = [];
    for (let e of this.extensionsByName.values()) {
      if (e.parentFile.packageName == protoPackage) {
        extensions.push(e);
      }
    }
    return extensions;
  }

  /**
   * Get all registered files.
   */
  allFiles(): Iterable<File> {
    return this.filesByName.values();
  }

  /**
   * Get all registered messages.
   */
  allMessages(): Iterable<Message> {
    return this.messagesByName.values();
  }

  /**
   * Get all registered enums.
   */
  allEnums(): Iterable<Enum> {
    return this.enumsByName.values();
  }

  /**
   * Get all registered extensions.
   */
  allExtensions(): Iterable<Extension> {
    return this.extensionsByName.values();
  }
}

/**
 * Resolve a enum type name with respect to a reference namespace to its
 * `protogen` type.
 *
 * @param registry The registry where the enum to resolve is registered.
 * @param reference: The reference namespace.
 * @param enumType: The enum type name to resolve.
 * @returns The resolved enum or `null` if the enum type name could not be
 * resolved.
 *
 * If the `enumType` starts with a '.' it is fully-qualified. Otherwise, C++
 * like scoping rules are used to find the type with respect to the `reference`
 * namespace. For example, for a reference namespace of
 * "my.pkg.A.B" and a enum type name of `C`, the registry will searched for an
 * enum named "my.pkg.A.B.C", "my.pkg.A.C", "my.pkg.C", "my.C" and "C" in that
 * order. The first found enum will be returned, if any.
 */
export function resolveEnumTypeName(
  registry: Registry,
  reference: string,
  enumType: string
) {
  if (enumType.charAt(0) == ".") {
    return registry.enumByName(enumType.slice(1));
  }
  throw new Error("resolve without dot notation not implemented yet");
}

/**
 * Resolve a message type name with respect to a reference namespace to its
 * `protogen` type.
 *
 * @param registry The registry where the message to resolve is registered.
 * @param reference: The reference namespace.
 * @param messageType: The message type name to resolve.
 * @returns The resolved message or `null` if the message type name could not be
 * resolved.
 *
 * If the `messageType` starts with a '.' it is fully-qualified. Otherwise, C++
 * like scoping rules are used to find the type with respect to the `reference`
 * namespace. For example, for a reference namespace of
 * "my.pkg.A.B" and a message type name of `C`, the registry will searched for an
 * message named "my.pkg.A.B.C", "my.pkg.A.C", "my.pkg.C", "my.C" and "C" in
 * that order. The first found message will be returned, if any.
 */
export function resolveMessageTypeName(
  registry: Registry,
  reference: string,
  messageType: string
) {
  if (messageType.charAt(0) == ".") {
    return registry.messageByName(messageType.slice(1));
  }
  throw new Error("resolve without dot notation not implemented yet");
}
