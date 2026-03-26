function gtag --description "Create a git tag and push it, replacing any existing tag of the same name"
    if test (count $argv) -ne 1
        echo "Usage: gtag <tag-name>"
        return 1
    end

    set -l tag $argv[1]

    if not git rev-parse --git-dir >/dev/null 2>&1
        echo "Not inside a git repository"
        return 1
    end

    if git tag -l $tag | string length --quiet
        echo "Tag '$tag' exists locally — deleting..."
        git tag -d $tag

        echo "Deleting '$tag' from remote (if present)..."
        git push origin --delete $tag 2>/dev/null; or true
    end

    echo "Creating tag '$tag' at HEAD..."
    git tag $tag

    echo "Pushing '$tag' to origin..."
    git push origin $tag
end
