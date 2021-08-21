import { FileDescriptorProto } from "google-protobuf/google/protobuf/descriptor_pb";
import { Location } from "./main";

/**
 * Find the comment set for the location specified by path.
 *
 * @param path: the location
 * @returns commentSet: for this position or an empty one if not found
 */
export function findLocation(
  file: FileDescriptorProto,
  path: number[]
): Location {
  let sourceCodeInfo = file.getSourceCodeInfo();
  if (sourceCodeInfo == null) {
    return new Location("", path, [], "", "");
  }
  for (let location of sourceCodeInfo.getLocationList()) {
    if (pathEquals(path, location.getPathList())) {
      return new Location(
        "",
        path,
        location.getLeadingDetachedCommentsList(),
        location.getLeadingComments() ?? "",
        location.getTrailingComments() ?? ""
      );
    }
  }
  return new Location("", path, [], "", "");
}

function pathEquals(p: number[], q: number[]): boolean {
  if (p.length != q.length) {
    return false;
  }
  for (let i = 0; i < p.length; i++) {
    if (p[i] != q[i]) {
      return false;
    }
  }
  return true;
}
