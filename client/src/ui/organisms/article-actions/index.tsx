import { Button } from "../../atoms/button";
import { NotificationsWatchMenu } from "../../molecules/notifications-watch-menu";
import { LanguageMenu } from "../../molecules/language-menu";

import { useIsServer } from "../../../hooks";
import { useUserData } from "../../../user-context";

import { Doc } from "../../../../../libs/types/document";

import "./index.scss";

import { BookmarkContainer } from "../../molecules/collection";

export const ArticleActions = ({
  doc,
  showArticleActionsMenu,
  setShowArticleActionsMenu,
}: {
  doc: Doc;
  showArticleActionsMenu: boolean;
  setShowArticleActionsMenu: (show: boolean) => void;
}) => {
  const userData = useUserData();
  const isServer = useIsServer();
  const isAuthenticated = userData && userData.isAuthenticated;
  const translations = doc.other_translations || [];
  const { native } = doc;

  function toggleArticleActionsMenu() {
    setShowArticleActionsMenu(!showArticleActionsMenu);
  }

  // @TODO we will need the following when including the language drop-down
  // const translations = doc.other_translations || [];

  return (
    (((translations && !!translations.length) ||
      (!isServer && isAuthenticated)) && (
      <>
        <div
          className={`article-actions${
            showArticleActionsMenu ? " show-actions" : ""
          }`}
        >
          <Button
            type="action"
            extraClasses="article-actions-toggle"
            onClickHandler={toggleArticleActionsMenu}
            icon={showArticleActionsMenu ? "cancel" : "ellipses"}
          >
            <span className="article-actions-dialog-heading">
              Article Actions
            </span>
          </Button>
          <ul className="article-actions-entries">
            <>
              {!isServer && isAuthenticated && (
                <li className="article-actions-entry">
                  <NotificationsWatchMenu doc={doc} />
                </li>
              )}
              {!isServer && isAuthenticated && (
                <li className="article-actions-entry">
                  <BookmarkContainer doc={doc} />
                </li>
              )}
              {translations && !!translations.length && (
                <li className="article-actions-entry">
                  <LanguageMenu
                    onClose={toggleArticleActionsMenu}
                    translations={translations}
                    native={native}
                  />
                </li>
              )}
            </>
          </ul>
        </div>
      </>
    )) ||
    null
  );
};