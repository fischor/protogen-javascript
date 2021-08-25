import * as descriptor_pb from "google-protobuf/google/protobuf/descriptor_pb";
// "jspb" is a conventional import name.
import * as jspb from "google-protobuf";

import {
  Registry,
  resolveEnumTypeName,
  resolveMessageTypeName,
} from "./registry";
import { findLocation } from "./sourceCodeInfo";
import { camelCase, normaliseFieldObjectName } from "./util";

export class File {
  readonly proto: descriptor_pb.FileDescriptorProto;

  /**
   * Name of the file. Obtained from the FileDescriptorProto `name` field.
   * This is the full proto relative path to the file, e.g. `google/protobuf/any.proto`
   *
   * @internal Exposed to have users avoid to to proto.getName() || ""
   */
  readonly name: string;

  /**
   * The typescript import path of the file.
   * this.importPath = this.name.replace(".proto", "_pb.ts");
   */
  readonly jsImportPath: JSImportPath;

  /**
   * The proto package name. Obtain from the FileDescriptorProto `package` field.
   *
   * @internal Exposed to have users avoid to to proto.getPackage() || ""
   */
  readonly packageName: string;

  /**
   * The proto package name. Obtain from the FileDescriptorProto `package` field.
   *
   * @internal Exposed to have users avoid to to proto.getPackage() || ""
   */
  readonly syntax: string;

  readonly generate: boolean;
  readonly dependencies: File[] = [];
  readonly enums: Enum[] = [];
  readonly messages: Message[] = [];
  readonly services: Service[] = [];
  readonly extensions: Extension[] = [];

  readonly options: FileOptions;

  constructor(
    proto: descriptor_pb.FileDescriptorProto,
    generate: boolean,
    jsImportFunc: (filename: string, protoPackage: string) => JSImportPath
  ) {
    this.proto = proto;
    this.options = new FileOptions(proto.getOptions() ?? null);

    let name = proto.getName();
    if (!name) throw new Error("Name is null in file");
    this.name = name;

    let syntax = proto.getSyntax();
    // if (!syntax) throw new Error(`Syntax is null in file ${this.name}`);
    this.syntax = syntax || ""; // TODO: this throws an error for descriptor.proto

    let packageName = proto.getPackage();
    if (!packageName)
      throw new Error(`Package is not populated in file ${name}.`);
    this.packageName = packageName;

    this.generate = generate;
    this.jsImportPath = jsImportFunc(name, packageName);

    // Register messages and submessages to the registry.
    let messageTypeProtos = proto.getMessageTypeList();
    for (let i = 0; i < messageTypeProtos.length; i++) {
      let path = [4, i]; // 4 is the number of the message_type list in the FileDescriptorProto message.
      let message = new Message(messageTypeProtos[i], this, null, path);
      this.messages.push(message);
    }

    // Create top level enums.
    let enumTypeProtos = proto.getEnumTypeList();
    for (let i = 0; i < enumTypeProtos.length; i++) {
      let path = [5, i]; // 5 is the number of the enum_type list in the FileDescriptorProto message.
      let enumType = new Enum(enumTypeProtos[i], this, null, path);
      this.enums.push(enumType);
    }

    // Create services.
    let serviceProtos = proto.getServiceList();
    for (let i = 0; i < serviceProtos.length; i++) {
      let path = [6, i]; // 6 is the number of the service list in the FileDescriptorProto message.
      let service = new Service(serviceProtos[i], this, path);
      this.services.push(service);
    }

    // Create top-level extensions.
    let extensionProtos = proto.getExtensionList();
    for (let i = 0; i < extensionProtos.length; i++) {
      let path = [7, i]; // 7 is the number of the extension list in the FileDescriptorProto message.
      let extension = new Field(extensionProtos[i], null, this, null, path);
      this.extensions.push(extension);
    }
  }

  _register(reg: Registry) {
    reg.registerFile(this);

    for (let m of this.messages) {
      m._register(reg);
    }
    for (let e of this.enums) {
      reg.registerEnum(e);
    }
    for (let s of this.services) {
      s._register(reg);
    }
    for (let e of this.extensions) {
      reg.registerExtension(e);
    }
  }

  _resolve(reg: Registry) {
    for (let depName of this.proto.getDependencyList()) {
      let file = reg.fileByName(depName);
      if (file == null) {
        throw new Error(
          `file ${this.name}: failed to resolve dependency ${depName}`
        );
      }
      this.dependencies.push(file);
    }
    for (let m of this.messages) {
      m._resolve(reg);
    }
    for (let s of this.services) {
      s._resolve(reg);
    }
    for (let e of this.extensions) {
      e._resolve(reg);
    }
  }
}

// This class wont get exported and is not intended to be instanciated
// by the client anyway. So its fine to have just the types exported.
export class FileOptions {
  // TODO: can it actually be null i.e. will it actually ever be null
  // if sent from protoc?
  proto: descriptor_pb.FileOptions | null;

  /**
   * Is optional.
   */
  javaPackage: string | undefined;

  /**
   * Is optional.
   */
  javaOuterClassname: string | undefined;

  /**
   * Is optional, but defaults to false.
   */
  javaMultipleFiles: boolean;

  /**
   * Is optional, but defaults to false.
   */
  javaStringCheckUtf8: boolean;

  /**
   * Is optional, default to SPEED.
   */
  optimizeFor: descriptor_pb.FileOptions.OptimizeMode;

  /**
   *
   * @internal Exposed to have users avoid to to proto?.getGoPackage() || "".
   */
  goPackage: string | undefined;

  ccGenericServices: boolean;
  javaGenericServices: boolean;
  pyGenericServices: boolean;
  phpGenericServices: boolean;

  deprecated: boolean;

  /**
   * Defaults to true.
   */
  ccEnableArenas: boolean;

  objcClassPrefix: string | undefined;

  csharpNamespace: string | undefined;

  swiftPrefix: string | undefined;

  phpClassPrefix: string | undefined;

  phpNamespace: string | undefined;

  phpMetadataNamespace: string | undefined;

  rubyPackage: string | undefined;

  constructor(proto: descriptor_pb.FileOptions | null) {
    this.proto = proto;
    this.javaPackage = proto?.getGoPackage();
    this.javaOuterClassname = proto?.getJavaOuterClassname();
    this.javaMultipleFiles = proto?.getJavaMultipleFiles() ?? false;
    this.javaStringCheckUtf8 = proto?.getJavaStringCheckUtf8() ?? false;
    this.optimizeFor =
      proto?.getOptimizeFor() ?? descriptor_pb.FileOptions.OptimizeMode.SPEED;
    this.goPackage = proto?.getGoPackage();
    this.ccGenericServices = proto?.getCcGenericServices() ?? false;
    this.javaGenericServices = proto?.getJavaGenericServices() ?? false;
    this.pyGenericServices = proto?.getPyGenericServices() ?? false;
    this.phpGenericServices = proto?.getCcGenericServices() ?? false;
    this.deprecated = proto?.getDeprecated() ?? false;
    this.ccEnableArenas = proto?.getCcEnableArenas() ?? true;
    this.objcClassPrefix = proto?.getObjcClassPrefix();
    this.csharpNamespace = proto?.getCsharpNamespace();
    this.swiftPrefix = proto?.getSwiftPrefix();
    this.phpClassPrefix = proto?.getPhpClassPrefix();
    this.phpNamespace = proto?.getPhpNamespace();
    this.phpMetadataNamespace = proto?.getPhpMetadataNamespace();
    this.rubyPackage = proto?.getRubyPackage();
  }

  getExtension<T>(handle: jspb.ExtensionFieldInfo<T>): T | null {
    if (this.proto == null) {
      return null;
    }
    return this.proto.getExtension(handle) ?? null;
  }
}

/**
 * Service describes a protobuf service.
 */
export class Service {
  readonly name: string;
  readonly fullName: string;
  readonly proto: descriptor_pb.ServiceDescriptorProto;
  readonly jsIdent: JSIdent;
  readonly parentFile: File;
  readonly methods: Method[] = [];
  readonly location: Location;
  readonly options: ServiceOptions;

  constructor(
    proto: descriptor_pb.ServiceDescriptorProto,
    parentFile: File,
    path: number[]
  ) {
    this.proto = proto;
    this.options = new ServiceOptions(proto.getOptions() ?? null);
    this.parentFile = parentFile;
    this.location = findLocation(parentFile.proto, path);

    let name = proto.getName();
    if (!name) throw new Error("Service name not populated");
    this.name = name;
    this.fullName = `${this.parentFile.packageName}.${name}`;
    this.jsIdent = parentFile.jsImportPath.ident(name);

    // Create service methods.
    let methodProtos = proto.getMethodList();
    for (let i = 0; i < methodProtos.length; i++) {
      let method = new Method(methodProtos[i], this, [...path, 2, i]);
      this.methods.push(method);
    }
  }

  _register(reg: Registry) {
    reg.registerService(this);
  }

  _resolve(reg: Registry) {
    for (let m of this.methods) {
      m._resolve(reg);
    }
  }
}

export class ServiceOptions {
  // TODO: can it actually be null i.e. will it actually ever be null
  // if sent from protoc?
  proto: descriptor_pb.ServiceOptions | null;

  /** Defaults to false. */
  deprecated: boolean;

  constructor(proto: descriptor_pb.ServiceOptions | null) {
    this.proto = proto;
    this.deprecated = proto?.getDeprecated() ?? false;
  }

  getExtension<T>(handle: jspb.ExtensionFieldInfo<T>): T | null {
    if (this.proto == null) {
      return null;
    }
    return this.proto.getExtension(handle) ?? null;
  }
}

/**
 * Method describes a protobuf service method.
 */
export class Method {
  /**
   * The MethodDescriptor for this method.
   */
  readonly proto: descriptor_pb.MethodDescriptorProto;

  /**
   * Name of the method.
   *
   * @interal to avoid proto.getName()...but maybe remove since its
   * expected to use jsName anyway
   */
  readonly name: string;

  /**
   * Full name of the method.
   */
  readonly fullName: string;

  /**
   * Javascript name of the method. This is typically the same as `name`,
   * expect that the first character is strictly lower cased.
   *
   * TODO(): this needs to be verified.
   */
  readonly jsName: string;

  /**
   * Defaults to false.
   *
   * @internal to avoid unwrapping and defaulting
   */
  readonly clientStreaming: boolean;

  /**
   * Defaults to false.
   *
   * @internal to avoid unwrapping and defaulting
   */
  readonly serverStreaming: boolean;

  /**
   * The grpcPath for this method:
   * path: "/" + <service_full_name> + "/" + <method_short_name>
   */
  readonly grpcPath: string;

  /**
   * The service this method belongs to.
   */
  readonly parent: Service;

  /**
   * Input message.
   */
  readonly input!: Message; // set after resolve

  /**
   * Output message.
   */
  readonly output!: Message; // set after resolve

  /**
   * Location information.
   */
  readonly location: Location;

  readonly options: MethodOptions;

  constructor(
    proto: descriptor_pb.MethodDescriptorProto,
    parent: Service,
    path: number[]
  ) {
    this.proto = proto;
    let name = proto.getName();
    if (!name) throw new Error("Initializing method with no name."); // TODO(fischor): better error message
    this.name = name;
    this.jsName = this.name.charAt(0).toLowerCase() + this.name.slice(1);
    this.fullName = `${parent.fullName}.${name}`;
    this.clientStreaming = proto.getClientStreaming() ?? false;
    this.serverStreaming = proto.getServerStreaming() ?? false;
    this.grpcPath = `/${parent.fullName}/{name}`;
    this.parent = parent;
    this.location = findLocation(parent.parentFile.proto, path);
    this.options = new MethodOptions(proto.getOptions() ?? null);
  }

  /**
   * Resolve reads the input and output messages for the Method from reg.
   */
  _resolve(reg: Registry) {
    let inputName = this.proto.getInputType() || "";
    let input = resolveMessageTypeName(reg, this.fullName, inputName);
    if (!input)
      throw new Error(`Method ${this.fullName}: ${inputName} not registered`);
    // @ts-ignore
    this.input = input;

    let outputName = this.proto.getOutputType() || "";
    let output = resolveMessageTypeName(reg, this.fullName, outputName);
    if (!output)
      throw new Error(`Method ${this.fullName}: ${inputName} not registered`);
    // @ts-ignore
    this.output = output;
  }
}

export class MethodOptions {
  // TODO: can it actually be null i.e. will it actually ever be null
  // if sent from protoc?
  proto: descriptor_pb.MethodOptions | null;

  /** Defaults to false. */
  deprecated: boolean;

  /** Default to IDEMPOTENCY_UNKNOWN. */
  idempotencyLevel: descriptor_pb.MethodOptions.IdempotencyLevel;

  constructor(proto: descriptor_pb.MethodOptions | null) {
    this.proto = proto;
    this.deprecated = proto?.getDeprecated() ?? false;
    this.idempotencyLevel =
      proto?.getIdempotencyLevel() ??
      descriptor_pb.MethodOptions.IdempotencyLevel.IDEMPOTENCY_UNKNOWN;
  }

  getExtension<T>(handle: jspb.ExtensionFieldInfo<T>): T | null {
    if (this.proto == null) {
      return null;
    }
    return this.proto.getExtension(handle) ?? null;
  }
}

/**
 * Messages describes a proto message.
 */
export class Message {
  /**
   *
   */
  readonly proto: descriptor_pb.DescriptorProto;

  /**
   * Short name of the message.
   */
  readonly name: string;

  /**
   * Full name of the message.
   * This is the name inclusive package name. For example
   * `google.protobuf.FieldDescriptorProto.Type`
   */
  readonly fullName: string;

  /**
   * Javascript identifier.
   */
  readonly jsIdent: JSIdent;

  /**
   * The File this message is declared in.
   */
  readonly parentFile: File;

  /**
   * Parent message if this message is a nested message, `null` otherwise.
   */
  readonly parent: Message | null;
  readonly fields: Field[] = [];
  readonly oneofs: Oneof[] = [];
  readonly enums: Enum[] = [];
  readonly messages: Message[] = [];
  readonly extensions: Extension[] = [];
  readonly location: Location;
  readonly options: MessageOptions;

  constructor(
    proto: descriptor_pb.DescriptorProto,
    parentFile: File,
    parent: Message | null,
    path: number[]
  ) {
    this.proto = proto;
    this.options = new MessageOptions(proto.getOptions() ?? null);

    let name = proto.getName();
    if (!name) throw new Error("Initializing message with no name."); // TODO(fischor): better error message
    this.name = name;

    this.fullName = parent
      ? `${parent.fullName}.${name}`
      : `${parentFile.packageName}.${name}`;
    this.parent = parent;
    this.parentFile = parentFile;

    this.location = findLocation(parentFile.proto, path);
    let relFullName = this.fullName.slice(
      this.parentFile.packageName.length + 1
    ); // +1 for the dot
    this.jsIdent = parentFile.jsImportPath.ident(relFullName);

    // Create oneofs.
    let oneofProtos = proto.getOneofDeclList();
    for (let i = 0; i < oneofProtos.length; i++) {
      let oneOfPath = [...path, 8, i]; // 8 is the number of the oneof_decl list in DescriptorProto
      let oneof = new Oneof(oneofProtos[i], this, oneOfPath);
      this.oneofs.push(oneof);
    }

    // Create fields.
    let fieldsProto = proto.getFieldList();
    for (let i = 0; i < fieldsProto.length; i++) {
      let fieldPath = [...path, 2, i]; // 2 is the number of the field list in DescriptorProto

      // Confusion: https://github.com/protocolbuffers/protobuf/issues/170#issue-54707235
      let field: Field;
      if (fieldsProto[i].hasOneofIndex()) {
        let oneofIdx = fieldsProto[i].getOneofIndex() || 0;
        if (this.oneofs.length < oneofIdx)
          throw new Error(
            `no such oneofindex ${oneofIdx} in ${this.fullName} (got ${this.oneofs.length} oneofs)`
          );
        let oneof = this.oneofs[oneofIdx];
        field = new Field(fieldsProto[i], this, parentFile, oneof, fieldPath);
        // Push the fields to both, the Oneof and the Message itself, since in the
        // end this field will be part of the Message.fields and
        // Message.oneof[i].fields.
        oneof.fields.push(field);
        this.fields.push(field);
      } else {
        field = new Field(fieldsProto[i], this, parentFile, null, fieldPath);
        this.fields.push(field);
      }
    }

    // Create nested messages.
    let nestedTypeProtos = proto.getNestedTypeList();
    for (let i = 0; i < nestedTypeProtos.length; i++) {
      let nestedPath = [...path, 3, i]; // 3 is the field_number for `nested_type` in DescriptorProto message.
      let nestedMessage = new Message(
        nestedTypeProtos[i],
        parentFile,
        this,
        nestedPath
      );
      this.messages.push(nestedMessage);
    }

    // Create nested enums.
    let enumTypeProtos = proto.getEnumTypeList();
    for (let i = 0; i < enumTypeProtos.length; i++) {
      let nestedPath = [...path, 4, i]; // 4 is the field_number for `enum_type` in DescriptorProto message.
      let enumType = new Enum(enumTypeProtos[i], parentFile, this, nestedPath);
      this.enums.push(enumType);
    }

    // Create nested extensions.
    let extensionProtos = proto.getExtensionList();
    for (let i = 0; i < extensionProtos.length; i++) {
      let nestedPath = [...path, 6, i]; // 6 is the field_number for `extension` in DescriptorProto message.
      let extension = new Field(
        extensionProtos[i],
        this,
        parentFile,
        null,
        nestedPath
      );
      this.extensions.push(extension);
    }
  }

  _register(reg: Registry) {
    reg.registerMessage(this);
    for (let m of this.messages) {
      reg.registerMessage(m);
    }
    for (let e of this.enums) {
      reg.registerEnum(e);
    }
    for (let e of this.extensions) {
      reg.registerExtension(e);
    }
  }

  _resolve(reg: Registry) {
    for (let m of this.messages) {
      m._resolve(reg);
    }
    for (let f of this.fields) {
      f._resolve(reg);
    }
    for (let e of this.extensions) {
      e._resolve(reg);
    }

    // Remove autogenerated messages. This must happen
    // here and can not happen directly in the constructor
    // because the map needs to be registered and resolved
    // as well. Looping backwards to remove inplace.
    let i = this.messages.length;
    while (i--) {
      let m = this.messages[i];
      if (m.proto.getOptions() && m.proto.getOptions()!.getMapEntry() == true) {
        this.messages.splice(i, 1);
      }
    }
  }
}

export class MessageOptions {
  // TODO: can it actually be null i.e. will it actually ever be null
  // if sent from protoc?
  proto: descriptor_pb.MessageOptions | null;

  /**
   * Default to false.
   */
  messageSetWireFormat: boolean;

  /** Default to false. */
  noStandardDescriptorAccessor: boolean;

  /** Is this message deprecated. Defaults to false. */
  deprecated: boolean;

  /** has no default */
  mapEntry: boolean | undefined;

  // not part of public api; might change
  constructor(proto: descriptor_pb.MessageOptions | null) {
    this.proto = proto;
    this.messageSetWireFormat = proto?.getMessageSetWireFormat() ?? false;
    this.noStandardDescriptorAccessor =
      proto?.getNoStandardDescriptorAccessor() ?? false;
    this.deprecated = proto?.getDeprecated() ?? false;
    this.mapEntry = proto?.getMapEntry();
  }

  getExtension<T>(handle: jspb.ExtensionFieldInfo<T>): T | null {
    if (this.proto == null) {
      return null;
    }
    return this.proto.getExtension(handle) ?? null;
  }
}

export class Enum {
  readonly proto: descriptor_pb.EnumDescriptorProto;
  readonly name: string;
  readonly fullName: string;
  readonly parentFile: File;
  readonly parent: Message | null;
  readonly jsIdent: JSIdent;
  readonly location: Location;
  readonly values: EnumValue[] = [];
  readonly options: EnumOptions;

  constructor(
    proto: descriptor_pb.EnumDescriptorProto,
    parentFile: File,
    parent: Message | null,
    path: number[]
  ) {
    this.proto = proto;
    this.options = new EnumOptions(proto.getOptions() ?? null);
    let name = proto.getName();
    // TODO(fischor): better error message
    if (!name) throw new Error("Enum has no name");
    this.name = name;

    this.fullName = parent
      ? `${parent.fullName}.${name}`
      : `${parentFile.packageName}.${name}`;

    this.parentFile = parentFile;
    this.parent = parent;

    // TODO is this correct for nested messages?, or is the parent name missing?
    // how to handle nested messages?
    // are they containing the parent name or not? Document that here!
    let relFullName = this.fullName.slice(parentFile.packageName.length + 1); // +1 for the dot
    this.jsIdent = parentFile.jsImportPath.ident(relFullName);

    this.location = findLocation(parentFile.proto, path);

    let enumValuesProto = proto.getValueList();
    for (let i = 0; i < enumValuesProto.length; i++) {
      let valuePath = [...path, 2, i]; // 2 is the field number for `value` in EnumDescriptorProto
      this.values.push(new EnumValue(enumValuesProto[i], this, valuePath));
    }
  }
}

export class EnumOptions {
  // TODO: can it actually be null i.e. will it actually ever be null
  // if sent from protoc?
  proto: descriptor_pb.EnumOptions | null;

  allowAlias: boolean | undefined;

  /** Defaults to false. */
  deprecated: boolean;

  constructor(proto: descriptor_pb.EnumOptions | null) {
    this.proto = proto;
    this.allowAlias = proto?.getAllowAlias();
    this.deprecated = proto?.getDeprecated() ?? false;
  }

  getExtension<T>(handle: jspb.ExtensionFieldInfo<T>): T | null {
    if (this.proto == null) {
      return null;
    }
    return this.proto.getExtension(handle) ?? null;
  }
}

export class EnumValue {
  readonly proto: descriptor_pb.EnumValueDescriptorProto;
  readonly parent: Enum;

  /**
   * SHort name of the enum value.
   *
   * For example:
   *
   * ```
   * enum State {
   *  STATE_UNDEFINED = 0;
   *  STATE_ACTIVE = 1;
   *  STATE_INACTIVE = 2;
   * }
   * ```
   *
   * the names would be "STATE_UNDEFINED", "STATE_ACTIVE" and "STATE_INACTIVE".
   */
  readonly name: string;

  /**
   * All other proto declarations are in the namespace of the parent. However,
   * enum values do not follow this rule and are within the namespace of the
   * parent's parent (i.e., they are a sibling of the containing enum). Thus,
   * a value named "FOO_VALUE" declared within an enum uniquely identified as
   * "proto.package.MyEnum" has a full name of "proto.package.FOO_VALUE".
   */
  readonly fullName: string;

  readonly location: Location;

  readonly enumNumber: number;

  readonly options: EnumValueOptions;

  constructor(
    proto: descriptor_pb.EnumValueDescriptorProto,
    parent: Enum,
    path: number[]
  ) {
    this.proto = proto;
    this.options = new EnumValueOptions(proto.getOptions() ?? null);
    this.parent = parent;

    // EnumValue full names are special: always within the namespace
    // of the parent file, and not within the namespace of the enum.
    let shortName = proto.getName();
    if (!shortName)
      throw new Error(
        `enum ${parent.fullName}, value index ${
          path[-1]
        }: no name in EnumValueDescriptor.`
      );
    this.name = shortName;
    this.fullName = `${parent.parentFile.packageName}.${shortName}`;

    // proto.getNumber might return undefined. In that case, 0 is assumed.
    let enumNumber = proto.getNumber() || 0;
    this.enumNumber = enumNumber;

    this.location = findLocation(parent.parentFile.proto, path);
  }
}

export class EnumValueOptions {
  // TODO: can it actually be null i.e. will it actually ever be null
  // if sent from protoc?
  proto: descriptor_pb.EnumValueOptions | null;

  /** Defaults to false. */
  deprecated: boolean;

  constructor(proto: descriptor_pb.EnumValueOptions | null) {
    this.proto = proto;
    this.deprecated = proto?.getDeprecated() ?? false;
  }

  getExtension<T>(handle: jspb.ExtensionFieldInfo<T>): T | null {
    if (this.proto == null) {
      return null;
    }
    return this.proto.getExtension(handle) ?? null;
  }
}

export class Oneof {
  readonly proto: descriptor_pb.OneofDescriptorProto;
  readonly name: string;
  readonly parent: Message;
  readonly fields: Field[] = [];
  readonly location: Location;
  readonly options: OneofOptions;

  constructor(
    proto: descriptor_pb.OneofDescriptorProto,
    parent: Message,
    path: number[]
  ) {
    this.proto = proto;
    this.options = new OneofOptions(proto.getOptions() ?? null);
    let name = proto.getName();
    if (!name) throw new Error("Initializing message with no name."); // TODO(fischor): better error message
    this.name = name;
    this.parent = parent;
    this.location = findLocation(parent.parentFile.proto, path);
  }

  // no resolve or register function here. Fields will be added
  // by the message that created the oneof.
}

export class OneofOptions {
  // TODO: can it actually be null i.e. will it actually ever be null
  // if sent from protoc?
  proto: descriptor_pb.OneofOptions | null;

  constructor(proto: descriptor_pb.OneofOptions | null) {
    this.proto = proto;
  }

  getExtension<T>(handle: jspb.ExtensionFieldInfo<T>): T | null {
    if (this.proto == null) {
      return null;
    }
    return this.proto.getExtension(handle) ?? null;
  }
}

/**
 * Field describes a field within a proto message.
 */
export class Field {
  /**
   * FieldDescriptor for this Field.
   */
  readonly proto: descriptor_pb.FieldDescriptorProto;

  /**
   * Name of the field.
   */
  readonly name: string;

  /**
   * Full name of the field.
   */
  readonly fullName: string;

  /**
   * Json name of the field.
   *
   * TODO(fischor): Document how jsonNames are generated from a Fields name.
   * Document that for some edge cases, a "_pb" is added as prefix.
   */
  readonly jsonName: string;

  /**
   * Number of the filed.
   */
  readonly number: number;

  /**
   * The message this field is defined in.
   */
  readonly parent: Message | null; // nil if top level extension

  /**
   * The file this field is defined in.
   */
  readonly parentFile: File;

  /**
   * The Oneof this field is defined in, if any.
   */
  readonly oneof: Oneof | null; // containingOneof

  /**
   * Extended message for extension fields, null otherwise.
   * E.g. for
   *
   * ```
   * extend google.protobuf.MethodOptions {
   *   // See `HttpRule`.
   *   HttpRule http = 72295728;
   * }
   * ```
   *
   * this would point to the `MethodOptions` Message.
   */
  readonly extendee: Message | null = null; // set after resolve

  readonly kind: Kind;
  /**
   * Optionl, required or repeated.
   */
  readonly cardinality: Cardinality;

  /**
   * If this field is an enum field, this points to this enum.
   */
  readonly enumType: Enum | null = null; // (force) set after resolve

  /**
   * If this field is a message field (or map) this points to this message.
   */
  readonly message: Message | null = null; // (force) set after resolve

  /**
   * Location.
   */
  readonly location: Location;

  readonly options: FieldOptions;

  constructor(
    proto: descriptor_pb.FieldDescriptorProto,
    parent: Message | null,
    parentFile: File,
    oneof: Oneof | null,
    path: number[]
  ) {
    this.proto = proto;
    this.options = new FieldOptions(proto.getOptions() ?? null);

    let name = proto.getName();
    if (!name) throw new Error("field name not populated");
    this.name = name;

    if (parent != null) {
      this.fullName = `${parent.fullName}.${this.name}`;
    } else {
      // For top-level extensions.
      // TODO(fischor): whats supposed to be the full name of an extension field?
      this.fullName = `${parentFile.packageName}.${this.name}`;
    }
    let jsonName = proto.getJsonName() || "";
    this.jsonName = normaliseFieldObjectName(camelCase(jsonName));

    let number = proto.getNumber();
    if (!number)
      throw new Error(`field ${this.fullName}: number not populated`);
    this.number = number;

    this.parentFile = parentFile;
    this.parent = parent;
    let protoType = proto.getType();
    if (!protoType)
      throw new Error(`field {this.fullName}: type not populated`);
    this.kind = kind(protoType);
    this.oneof = oneof;
    this.location = findLocation(parentFile.proto, path);

    switch (proto.getLabel() || 0) {
      case 1:
        this.cardinality = Cardinality.Optional;
        break;
      case 2:
        this.cardinality = Cardinality.Required;
        break;
      case 3:
        this.cardinality = Cardinality.Repeated;
        break;
      default:
        throw new Error(
          `field ${this.fullName}: unrecognized label ${proto.getLabel()}`
        );
    }
  }

  _resolve(reg: Registry) {
    // Resolve enumType or message.
    let typeName = this.proto.getTypeName();
    if (typeName && typeName != "") {
      // @ts-ignore
      this.enumType = resolveEnumTypeName(reg, this.fullName, typeName);
      if (this.enumType == null) {
        // @ts-ignore
        this.message = resolveMessageTypeName(reg, this.fullName, typeName);
      }
      // If both are null something went wrong.
      if (this.enumType == null && this.message == null) {
        // Neither enum nor message with that name found.
        throw new Error(
          `No message or enum found for type_name=${typeName} in "${
            this.parent ? this.parent.name : "top-level"
          }".`
        );
      }
    }
    // For extensions, resolve the extendee. It is resolved in the same
    // ways type_name is resolved.
    let extendee = this.proto.getExtendee();
    if (extendee && extendee != "") {
      // @ts-ignore
      this.extendee = resolveMessageTypeName(reg, this.fullName, extendee);
      if (this.extendee == null) {
        throw new Error(
          `Extendee not found in type registry: extendee=${extendee} in ${
            this.parent ? this.parent.name : "top-level"
          }.`
        );
      }
    }
  }

  /**
   * Indicates wheter this field is a map field.
   */
  isMap(): boolean {
    if (this.message == null) {
      return false;
    }
    let mapEntry = this.message.options.mapEntry;
    if (mapEntry != undefined) {
      return mapEntry;
    }
    return false;
  }

  /**
   * Indicates wheter this field is a list.
   *
   * This is the same as checking if cardinality is repeated an isMap is false.
   */
  isList(): boolean {
    return this.cardinality == Cardinality.Repeated && !this.isMap();
  }

  /**
   * Returns the field representing the map key if isMap returns true. Else,
   * returns null
   */
  mapKey(): Field | null {
    if (!this.isMap()) return null;
    // The map key is always the first field in the autogenerated Message for
    // that map.
    return this.message!.fields[0];
  }

  /**
   * Returns the field representing the map value if isMap returns true. Else,
   * returns null.
   */
  mapValue(): Field | null {
    if (!this.isMap()) return null;
    // The map value is always the second field in the autogenerated Message for
    // that map.

    // Debug
    //  if (this.message!.fields[1].kind == Kind.Message) {
    //    throw new Error(
    //      JSON.stringify({
    //        keyName: this.message!.fields[0].fullName,
    //        keyKind: this.message!.fields[0].kind,
    //        valueName: this.message!.fields[1].fullName,
    //        valueKind: this.message!.fields[1].kind,
    //        valueIsNull: this.message!.fields[1].message == null,
    //        valueMessageName: this.message!.fields[1].message!.fullName,
    //      })
    //    );
    //  }
    return this.message!.fields[1];
  }
}

export class FieldOptions {
  // TODO: can it actually be null i.e. will it actually ever be null
  // if sent from protoc?
  proto: descriptor_pb.FieldOptions | null;

  /**
   * Default to CType.STRING
   */
  ctype: descriptor_pb.FieldOptions.CType;

  /**
   * Has no default
   */
  packed: boolean | undefined;

  /**
   * Defaults to JS_NORMAL.
   */
  jstype: descriptor_pb.FieldOptions.JSType;

  /** Default to false. */
  lazy: boolean;

  /** Defaults to false. */
  deprecated: boolean;

  constructor(proto: descriptor_pb.FieldOptions | null) {
    this.proto = proto;
    this.ctype = proto?.getCtype() ?? descriptor_pb.FieldOptions.CType.STRING;
    this.packed = proto?.getPacked();
    this.jstype =
      proto?.getJstype() ?? descriptor_pb.FieldOptions.JSType.JS_NORMAL;
    this.lazy = proto?.getLazy() ?? false;
    this.deprecated = proto?.getDeprecated() ?? false;
  }

  getExtension<T>(handle: jspb.ExtensionFieldInfo<T>): T | null {
    if (this.proto == null) {
      return null;
    }
    return this.proto.getExtension(handle) ?? null;
  }
}

export type Extension = Field;

/**
 * A TypeScript import path that can be used to derive `Ident`s from it, A path
 * is always a package, and thus to be imported from the node_modules folder, or
 * a file located under the current working directory of the proto complier or
 * and proto plugin.
 *
 * You might use any arbitrary module here for the files that you are
 * going to generate in your codegen.
 * TODO describe this better.
 */
export class JSImportPath {
  /**
   * The path of the module (within the npm module). With .ts or .d.ts ending.
   * If two files are in the same npmModule, this path is used to resolve
   * relative filepaths between two files that have imports between them.
   *
   * TODO: this should not have the .d.ts or .ts ending!
   *
   * Can be empty if all types to generate are accessible via the npm module
   * directly (in case an index.ts file exports them) and for that same npmModule
   * no code is going to be generated (since then we can not resolve the relative
   * filepath within that module)
   *
   * Can be empty if no code generation for this module is expected to happen
   * and all other files are going to import is via its npm path.
   */
  public path: string;

  /**
   * The npm module.
   */
  public npmModule: string;

  /**
   * Path relative to the npm module a. E.g. for "google-protobuf/google/protobuf/descriptor_pb"
   * it would be "google/protobuf/descriptor_pb". Note that often times is the
   * same as path, however not always.
   */
  public npmPathUnderModule: string;

  /**
   * Creates a new ImportPath.
   *
   * Note that for `isModule == true` the resulting import statements
   * won't replace any file extensions like `".d.ts"` or `".ts"`.
   *
   * TODO: document that for path is used only if nested imports are necessary
   */
  constructor(
    path: string,
    npmModule: string,
    npmPathUnderModule: string = ""
  ) {
    this.path = path;
    this.npmModule = npmModule;
    this.npmPathUnderModule = npmPathUnderModule;
  }

  ident(name: string): JSIdent {
    return new JSIdent(this, name);
  }

  equals(other: JSImportPath): boolean {
    return this.npmModule == other.npmModule && this.path == other.path;
  }
}

export enum Cardinality {
  Optional = 1,
  Required = 2,
  Repeated = 3,
}

export class Location {
  constructor(
    readonly sourceFile: string, // this is not in the Location proto
    readonly path: number[],
    readonly leadingDetached: string[],
    readonly leading: string,
    readonly trailing: string
  ) {}
}

/**
 * Same as google.protobuf.FieldDescriptorProto.Type
 */
export enum Kind {
  // 0 is reserved for errors.
  // Order is weird for historical reasons.
  Double = 1,
  Float = 2,
  // Not ZigZag encoded.  Negative numbers take 10 bytes.  Use TYPE_SINT64 if
  // negative values are likely.
  Int64 = 3,
  Uint64 = 4,
  // Not ZigZag encoded.  Negative numbers take 10 bytes.  Use TYPE_SINT32 if
  // negative values are likely.
  Int32 = 5,
  Fixed64 = 6,
  Fixed32 = 7,
  Bool = 8,
  String = 9,
  // Tag-delimited aggregate.
  // Group type is deprecated and not supported in proto3. However, Proto3
  // implementations should still be able to parse the group wire format and
  // treat group fields as unknown fields.
  Group = 10,
  Message = 11, // Length-delimited aggregate.

  // New in version 2.
  Bytes = 12,
  Uint32 = 13,
  Enum = 14,
  Sfixed32 = 15,
  Sfixed64 = 16,
  Sint32 = 17, // Uses ZigZag encoding.
  Sint64 = 18, // Uses ZigZag encoding.
}

export function kind(n: number): Kind {
  return n;
}

/**
 * A TypeScript identifier. An identifier is a pair of import path and name and
 * can reference any kind of TypeScript object/class/funciton.
 */
export class JSIdent {
  /**
   * Always a relative path, like e.g. for relative files
   *
   * 	"mycom/iam/v1/policy.pb"
   *
   * or for external packages
   *
   * 	google-protobuf
   *
   * The import alias is derived from that.
   */
  importPath: JSImportPath;

  /**
   * Name of the type represented by this Ident.
   * For nested messages e.g.
   *
   * ```
   * message A {
   * 	message B {
   *
   * 	}
   * }
   * ```
   *
   * this will be "A.B"
   */
  name: string;

  constructor(importPath: JSImportPath, name: string) {
    this.importPath = importPath;
    this.name = name;
  }
}
