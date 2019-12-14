package io.agora.rtc.education.room.whiteboard;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.widget.ImageView;

import com.herewhite.sdk.AbstractRoomCallbacks;
import com.herewhite.sdk.Displayer;
import com.herewhite.sdk.Room;
import com.herewhite.sdk.RoomParams;
import com.herewhite.sdk.WhiteSdk;
import com.herewhite.sdk.WhiteSdkConfiguration;
import com.herewhite.sdk.WhiteboardView;
import com.herewhite.sdk.domain.AnimationMode;
import com.herewhite.sdk.domain.BroadcastState;
import com.herewhite.sdk.domain.DeviceType;
import com.herewhite.sdk.domain.MemberState;
import com.herewhite.sdk.domain.Promise;
import com.herewhite.sdk.domain.RectangleConfig;
import com.herewhite.sdk.domain.RoomPhase;
import com.herewhite.sdk.domain.RoomState;
import com.herewhite.sdk.domain.SDKError;
import com.herewhite.sdk.domain.SceneState;
import com.herewhite.sdk.domain.ViewMode;

import java.util.Map;

import io.agora.rtc.lib.util.LogUtil;
import io.agora.rtc.lib.util.ToastUtil;

public class WhiteboardDelegate {

    private LogUtil log = new LogUtil("WhiteboardDelegate");
    private AppliancesToolBar mAppliancesToolBar;
    private WhiteSdk mWhiteSdk;
    private SceneHelper mSceneHelper = new SceneHelper();
    private Handler mHandler = new Handler(Looper.getMainLooper());
    private Room mRoom;
    private boolean mDidLeave = false;

    public void initApplianceToolBar(Map<String, ImageView> appliances) {
        this.mAppliancesToolBar = new AppliancesToolBar(appliances);
    }

    public void setApplianceColor(int color) {
        mAppliancesToolBar.setColor(color);
    }

    public void initWhiteSdk(Context c, WhiteboardView mWhiteboardView) {
        WhiteSdkConfiguration configuration = new WhiteSdkConfiguration(DeviceType.touch, 10, 0.1);
        mWhiteSdk = new WhiteSdk(mWhiteboardView, c, configuration);
    }


    public void setOnSceneChangeListener(SceneHelper.OnSceneChangeListener onSceneChangeListener) {
        mSceneHelper.setOnSceneChangeListener(onSceneChangeListener);
    }

    private void runOnUiThread(Runnable r) {
        mHandler.post(r);
    }

    public void goToFirstPage() {
        mSceneHelper.goToFirstPage();
    }

    public void goToPreviousPage() {
        mSceneHelper.goToPreviousPage();
    }

    public void goToNextPage() {
        mSceneHelper.goToNextPage();
    }

    public void goToEndPage() {
        mSceneHelper.goToEndPage();
    }

    public interface OnRoomStateChangedListener {

        void onSuccess();

        void onFailure(String err);

        void onRoomPhaseChange(RoomPhase phase);
    }

    public void joinRoom(String uuid, final OnRoomStateChangedListener callBack) {

        mDidLeave = false;
        WhiteboardAPI.getRoom(uuid, new WhiteboardAPI.Callback() {
            @Override
            public void success(String uuid, String roomToken) {
                log.i("get room success");
                RoomParams roomParams = new RoomParams(uuid, roomToken);
                mWhiteSdk.joinRoom(roomParams, new AbstractRoomCallbacks() {

                    @Override
                    public void onPhaseChanged(final RoomPhase phase) {
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                callBack.onRoomPhaseChange(phase);
                            }
                        });
                    }

                    @Override
                    public void onRoomStateChanged(RoomState modifyState) {
                        MemberState memberState = modifyState.getMemberState();
                        BroadcastState broadcastState = modifyState.getBroadcastState();
                        final SceneState sceneState = modifyState.getSceneState();

                        if (memberState != null) {
                            final String applianceName = memberState.getCurrentApplianceName();
                            final int[] sdkColor = memberState.getStrokeColor();

                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    mAppliancesToolBar.setState(applianceName, sdkColor);
                                }
                            });
                        }
                        if (broadcastState != null) {
                            final ViewMode viewMode = broadcastState.getMode();//自己是否为主播
                            final boolean hasBroadcaster = broadcastState.getBroadcasterInformation() != null;// 房间内是否有主播
                        }
                        if (sceneState != null) {
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    mSceneHelper.setSceneState(sceneState);
                                }
                            });
                        }
                    }
                }, new Promise<Room>() {

                    @Override
                    public void then(final Room room) {
                        log.i("join room success");
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                setupRoom(room);
                                if (callBack != null)
                                    callBack.onSuccess();
                            }
                        });
                    }

                    @Override
                    public void catchEx(final SDKError sdkError) {
                        log.i("join room fail" + sdkError);
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                if (callBack != null)
                                    callBack.onFailure(sdkError.getMessage());
                            }
                        });
                    }
                });
            }

            @Override
            public void fail(final String errorMessage) {
                log.i("get room fail:" + errorMessage);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (callBack != null)
                            callBack.onFailure(errorMessage);
                    }
                });
            }
        });
    }

    public void moveCameraToContainer(Double width, Double height) {
        mRoom.moveCameraToContainer(new RectangleConfig(width, height, AnimationMode.Immediately));
    }

    private void setupRoom(Room room) {
        mRoom = room;
        mAppliancesToolBar.setRoom(room);
        mSceneHelper.setRoom(room);

        if (mDidLeave) {
            room.disconnect();
        } else {
            MemberState memberState = room.getMemberState();
            String applianceName = memberState.getCurrentApplianceName();
            int[] sdkColor = memberState.getStrokeColor();
            mAppliancesToolBar.setState(applianceName, sdkColor);

            mSceneHelper.setSceneState(room.getSceneState());
        }
    }

    public void finishRoomPage() {
        mDidLeave = true;
        if (mRoom != null) {
            mRoom.disconnect();
            mRoom = null;
        }
        mHandler.removeCallbacksAndMessages(null);
    }

    private void showToast(String s) {
        if (!mDidLeave) {
            ToastUtil.showShort(s);
        }
    }

    public void setApplianceBarEnable(boolean enable) {
        mAppliancesToolBar.setViewsEnable(enable);
    }
}