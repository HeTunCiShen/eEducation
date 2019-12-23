import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import Whiteboard from './whiteboard';
import VideoPlayer from '../components/video-player';
import Control from './whiteboard/control';
import { AgoraStream } from '../utils/types';
import useStream from '../hooks/use-streams';
import { useLocation } from 'react-router';
import Tools from './whiteboard/tools';
import { SketchPicker } from 'react-color';
import { AgoraElectronClient } from '../utils/agora-electron-client';
import { UploadBtn } from './whiteboard/upload/upload-btn';
import { ResourcesMenu } from './whiteboard/resources-menu';
import ScaleController from './whiteboard/scale-controller';
import { PPTProgressPhase } from '../utils/upload-manager';
import { UploadNoticeView } from '../components/whiteboard/upload/upload-notice';
import Progress from '../components/progress/progress';
import { useRoomState, useWhiteboardState, useGlobalState } from '../containers/root-container';
import { roomStore } from '../stores/room';
import { whiteboard } from '../stores/whiteboard';
import { globalStore } from '../stores/global';
import { platform } from '../utils/platform';
import AgoraWebClient, { SHARE_ID } from '../utils/agora-rtc-client';
import "white-web-sdk/style/index.css";

const pathName = (path: string): string => {
  const reg = /\/([^/]*)\//g;
  reg.exec(path);
  if (RegExp.$1 === "aria") {
      return "";
  } else {
      return RegExp.$1;
  }
}

interface MediaBoardProps {
  handleClick?: (type: string) => void
  children?: any
}

const MediaBoard: React.FC<MediaBoardProps> = ({
  handleClick,
  children
}) => {

  const roomState = useRoomState();

  const whiteboardState = useWhiteboardState();
  
  const role = roomState.me.role;
  const room = whiteboardState.room;
  const me = roomState.me;
  const course = roomState.course;
  
  const ref = useRef<any>(false);

  const [pageTool, setPageTool] = useState<string>('');

  const {sharedStream} = useStream();

  const shared = roomState.rtc.shared;

  useEffect(() => {
    if (!shared && platform === 'web') return;

    const rtcClient = roomStore.rtcClient;
    if (!shared) {
      if (platform === 'electron') {
        const nativeClient = rtcClient as AgoraElectronClient;
        console.log("[native] electron screen sharing shared: ", shared, " nativeClient.shared: ", nativeClient.shared);
        nativeClient.shared &&
        nativeClient.stopScreenShare().then(() => {
          console.log("[native] remove local shared stream");
        }).catch(console.warn);
        return;
      }
    }

    if (platform === 'web') {
      const webClient = rtcClient as AgoraWebClient;
      // WARN: IF YOU ENABLED APP CERTIFICATE, PLEASE SIGN YOUR TOKEN IN YOUR SERVER SIDE AND OBTAIN IT FROM YOUR OWN TRUSTED SERVER API
      const screenShareToken = '';
      webClient.startScreenShare(screenShareToken).then(() => {
        webClient.shareClient.on('onTokenPrivilegeWillExpire', (evt: any) => {
          // WARN: IF YOU ENABLED APP CERTIFICATE, PLEASE SIGN YOUR TOKEN IN YOUR SERVER SIDE AND OBTAIN IT FROM YOUR OWN TRUSTED SERVER API
          const newToken = '';
          webClient.shareClient.renewToken(newToken);
        });
        webClient.shareClient.on('onTokenPrivilegeDidExpire', (evt: any) => {
          // WARN: IF YOU ENABLED APP CERTIFICATE, PLEASE SIGN YOUR TOKEN IN YOUR SERVER SIDE AND OBTAIN IT FROM YOUR OWN TRUSTED SERVER API
          const newToken = '';
          webClient.shareClient.renewToken(newToken);
        });
        webClient.shareClient.on('stopScreenSharing', (evt: any) => {
          console.log('stop screen share', evt);
          webClient.stopScreenShare().then(() => {
            roomStore.setScreenShare(false);
          }).catch(console.warn).finally(() => {
            console.log('[agora-web] stop share');
          })
        })
        const localShareStream = webClient.shareClient._localStream
        const _stream = new AgoraStream(localShareStream, localShareStream.getId(), true);
        roomStore.addLocalSharedStream(_stream);
      }).catch((err: any) => {
        roomStore.setScreenShare(false);
        if (err.type === 'error' && err.msg === 'NotAllowedError') {
          globalStore.showToast({
            message: `You canceled screen sharing`,
            type: 'notice'
          });
        }
        if (err.type === 'error' && err.msg === 'PERMISSION_DENIED') {
          globalStore.showToast({
            message: `Screen Sharing Failed: ${err.msg}`,
            type: 'notice'
          });
        }
        console.warn(err);
      }).finally(() => {
        console.log('[agora-web] start share');
      })
      return () => {
        console.log("before shared change", shared);
        shared && webClient.stopScreenShare().then(() => {
          roomStore.setScreenShare(false);
        }).catch(console.warn).finally(() => {
          console.log('[agora-web] stop share');
        })
      }
    }
  }, [shared]);

  const handlePageTool: any = (evt: any, type: string) => {
    setPageTool(type);
    console.log("[page-tool] click ", type);
    if (type === 'first_page') {
      changePage(1, true);
    }

    if (type === 'last_page') {
      changePage(totalPage, true);
    }

    if (type === 'prev_page') {
      changePage(currentPage-1);
    }

    if (type === 'next_page') {
      changePage(currentPage+1);
    }

    if (type === 'screen_sharing') {
      roomStore.setScreenShare(true);

      if (platform === 'electron') {
        const rtcClient = roomStore.rtcClient;
        globalStore.setNativeWindowInfo({
          visible: true,
          items: (rtcClient as AgoraElectronClient).getScreenShareWindows()
        })
      }
    }

    if (type === 'quit_screen_sharing') {
      roomStore.setScreenShare(false);
    }

    if (type === 'peer_hands_up') {
      globalStore.showDialog({
        type: 'apply',
        message: `${globalStore.state.notice.text}`,
      })
      setPageTool('');
    }

    if (handleClick) {
      handleClick(type);
    }
  }

  const isHost = useMemo(() => {
    return +roomStore.state.me.uid === +roomStore.state.course.linkId;
  }, [roomStore.state.me.uid,
    roomStore.state.course.linkId]);
  
  const location = useLocation();

  const current =  useMemo(() => {
    return whiteboardState.scenes.get(whiteboardState.currentScenePath);
  }, [whiteboardState.scenes, whiteboardState.currentScenePath]);

  const totalPage = useMemo(() => {
    if (!current) return 0;
    return current.totalPage;
  }, [current]);

  const currentPage = useMemo(() => {
    if (!current) return 0;
    return current.currentPage + 1;
  }, [current]);

  const addNewPage: any = (evt: any) => {
    if (!current) return;
    // const newIndex = netlessClient.state.sceneState.scenes.length;
    const newIndex = room.state.sceneState.index + 1;
    const scenePath = room.state.sceneState.scenePath;
    const currentPath = `/${pathName(scenePath)}`;
    room.putScenes(currentPath, [{}], newIndex);
    room.setSceneIndex(newIndex);
    whiteboard.updateRoomState();
  }

  const changePage = (idx: number, force?: boolean) => {
    if (ref.current || !current) return;
    const _idx = idx -1;
    if (_idx < 0 || _idx >= current.totalPage) return;
    if (force) {
      room.setSceneIndex(_idx);
      whiteboard.updateRoomState();
      return
    }
    if (current.type === 'dynamic') {
      if (_idx > current.currentPage) {
        room.pptNextStep();
      } else {
        room.pptPreviousStep();
      }
    } else {
      room.setSceneIndex(_idx);
    }
    whiteboard.updateRoomState();
  }

  const showControl: boolean = useMemo(() => {
    if (me.role === 'teacher') return true;
    if (location.pathname.match(/big-class/)) {
      if (me.role === 'student') {
        return true;
      }
    }
    return false;
  }, []);

const items = [
  {
    name: 'selector'
  },
  {
    name: 'pencil'
  },
  {
    name: 'rectangle',
  },
  {
    name: 'ellipse'
  },
  {
    name: 'text'
  },
  {
    name: 'eraser'
  },
  {
    name: 'color_picker'
  },
  {
    name: 'add'
  },
  {
    name: 'upload'
  },
  // {
  //   name: 'folder'
  // }
];

  const toolItems = useMemo(() => {
    return items.filter((item: any) => {
      if (role === 'teacher') return item;
      if (['add', 'folder', 'upload'].indexOf(item.name) === -1) {
        return item;
      }
    })
  }, []);

  const [tool, setTool] = useState<string | any>('pencil');

  const handleToolClick = (evt: any, name: string) => {
    if (!room) return;
    if (['upload', 'color_picker'].indexOf(name) !== -1 && name === tool) {
      setTool('');
      return;
    }
    setTool(name);
    if (name === 'color_picker') {
      return;
    }
    if (name === 'add' && addNewPage) {
      addNewPage();
      return;
    }
    if (name === 'upload') {
      return;
    }
    if (name === 'folder') {
      return
    }

    console.log("set member whiteboard", name);
    room.setMemberState({currentApplianceName: name});
  }

  const onColorChanged = (color: any) => {
    if (!room) return;
    const {rgb} = color;
    const {r, g, b} = rgb;
    room.setMemberState({
      strokeColor: [r, g, b]
    });
  }

  const lock = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      lock.current = true;
      whiteboard.destroy()
      .then(() => {

      }).catch(console.warn);
    }
  }, []);

  useEffect(() => {
    if (!lock.current && !whiteboard.state.room) {
      lock.current = true;
      whiteboard.join({
        rid: roomStore.state.course.rid,
        uid: me.boardId,
        userPayload: {
          userId: roomStore.state.me.uid,
          identity: roomStore.state.me.role === 'teacher' ? 'host' : 'guest'
        }
      })
      .then(() => {
        console.log("whiteboard.state.room.uuid", whiteboard.state.room.uuid);
      }).catch(console.warn)
      .finally(() => {
        lock.current = false;
      })
    }

    if (!lock.current && course.boardId && me.boardId !== course.boardId && whiteboard.state.room) {
      lock.current = true;
      whiteboard.join({
        rid: roomStore.state.course.rid,
        uid: course.boardId,
        userPayload: {
          userId: roomStore.state.me.uid,
          identity: roomStore.state.me.role === 'teacher' ? 'host' : 'guest'
        }
      })
      .then(() => {
        console.log("whiteboard.state.room.uuid", whiteboard.state.room.uuid);
      }).catch(console.warn)
      .finally(() => {
        lock.current = false;
      })
    }

  }, [me.boardId, course.boardId]);

  const [uploadPhase, updateUploadPhase] = useState<string>('init');
  const [convertPhase, updateConvertPhase] = useState<string>('init');

  const UploadPanel = useCallback(() => {
    if (tool !== 'upload' || !room) return null;
    return (<UploadBtn 
      room={room}
      uuid={room.uuid}
      roomToken={room.roomToken}
      onProgress={(phase: PPTProgressPhase, percent: number) => {
        if (phase === PPTProgressPhase.Uploading) {
          if (percent < 1) {
            !ref.current && uploadPhase === 'init' && updateUploadPhase('uploading');
          } else {
            !ref.current && updateUploadPhase('upload_success');
          }
          return;
        }

        if (phase === PPTProgressPhase.Converting) {
          if (percent < 1) {
            !ref.current && convertPhase === 'init' && updateConvertPhase('converting');
          } else {
            !ref.current && updateConvertPhase('convert_success');
          }
          return;
        }
      }}
      onFailure={(err: any) => {
        // WARN: capture exception
        console.warn("pptConvert [agora] err: " ,err, uploadPhase, convertPhase);
        if (uploadPhase === 'uploading') {
          updateUploadPhase('upload_failure');
          return;
        }
        if (convertPhase === 'converting') {
          updateConvertPhase('convert_failure');
          return;
        }
      }}
    />)
  }, [tool, room]);

  useEffect(() => {
    if (uploadPhase === 'upload_success') {
      globalStore.showUploadNotice({
        title: 'upload success',
        type: 'ok',
      });
    }
    if (uploadPhase === 'convert_failure') {
      globalStore.showUploadNotice({
        title: 'upload failure, check the network',
        type: 'error',
      });
    }
  }, [uploadPhase]);

  useEffect(() => {
    if (convertPhase === 'convert_success') {
      globalStore.showUploadNotice({
        title: 'convert success',
        type: 'ok',
      });
    }
    if (convertPhase === 'convert_failure') {
      globalStore.showUploadNotice({
        title: 'convert failure, check the network',
        type: 'error',
      });
    }
  }, [convertPhase]);

  const globalState = useGlobalState();

  const scale = whiteboardState.scale ? whiteboardState.scale : 1;

  const UploadProgressView = useCallback(() => {
    if (uploadPhase === 'uploading') {
      return (
        <Progress title={"uploading..."} />
      )
    } else 
    if (convertPhase === 'converting') {
      return (
        <Progress title={"converting..."} />
      )
    }
    return null;
  }, [uploadPhase, convertPhase]);
  
  return (
    <div className="media-board">
      {sharedStream ? 
        <VideoPlayer
          id={`${sharedStream.streamID}`}
          domId={`shared-${sharedStream.streamID}`}
          className={'screen-sharing'}
          streamID={sharedStream.streamID}
          stream={sharedStream.stream}
          video={true}
          audio={true}
          local={sharedStream.local}
        />
        :
        <Whiteboard
          room={room}
        />
      }
      <div className="layer">
        {!sharedStream ? 
        <>
          <Tools
          items={toolItems}
          currentTool={tool}
          handleToolClick={handleToolClick} />
          {tool === 'color_picker' && room && room.state ?
            <SketchPicker
              color={room.state.memberState.strokeColor}
              onChangeComplete={onColorChanged} />
          : null}
        </> : null}
        <UploadPanel />
        {children ? children : null}
      </div>
      {me.role === 'teacher' && room ?
        <ScaleController
          zoomScale={scale}
          onClick={() => {
            setTool('folder');
          }}
          zoomChange={(scale: number) => {
            room.moveCamera({scale});
            whiteboard.updateScale(scale);
          }}
        />
        :
        null
      }
      { showControl ?
      <Control
        notice={globalState.notice}
        role={role}
        sharing={Boolean(sharedStream)}
        current={pageTool}
        currentPage={currentPage}
        totalPage={totalPage}
        isHost={isHost}
        onClick={handlePageTool}/> : null }
        {tool === 'folder' && whiteboardState.room ? 
          <ResourcesMenu
            active={whiteboardState.activeDir}
            items={whiteboardState.dirs}
            onClick={(rootPath: string) => {
              if (room) {
                room.setScenePath(rootPath);
                room.setSceneIndex(0);
                whiteboard.updateRoomState();
              }
            }}
            onClose={(evt: any) => {
              setTool('')
            }}
          />
        : null}
      <UploadNoticeView />
      <UploadProgressView />
    </div>
  )
} 

export default React.memo(MediaBoard);